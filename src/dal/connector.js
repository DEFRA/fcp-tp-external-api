import { constants } from 'node:http2'
import { GraphQLError } from 'graphql'
import { withTraceId } from '@defra/hapi-tracing'
import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { safeErrorMessage } from '../common/helpers/logging/safe-error-message.js'
import { serverMetrics } from '../common/helpers/metrics.js'
import { getToken } from '../services/dal/token/get-token-service.js'

const logger = createLogger()

const NS_PER_MS = 1e6
const UNAVAILABLE_MESSAGE = 'The data access layer could not be reached'

function buildRequest (bearerToken, forwardedUserToken, query, variables) {
  const headers = withTraceId(config.get('tracing.header'), {
    'Content-Type': 'application/json',
    'gateway-type': config.get('dal.gatewayType'),
    Authorization: bearerToken
  })

  if (forwardedUserToken) {
    headers['x-forwarded-authorization'] = forwardedUserToken
  }

  return {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(config.get('dal.requestTimeoutMs'))
  }
}

function dalError (message, code, extensions = {}) {
  return new GraphQLError(message, { extensions: { code, ...extensions } })
}

async function readErrors (response) {
  try {
    const body = JSON.parse(await response.text())
    return Array.isArray(body?.errors) ? body.errors : []
  } catch {
    return []
  }
}

function operationName (query) {
  return /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'unknown'
}

function elapsedNs (startedAt) {
  return Number(process.hrtime.bigint() - startedAt)
}

function networkErrorCode (err) {
  return err.name === 'TimeoutError' ? 'TIMEOUT' : (err.cause?.code ?? err.name)
}

function dalErrorFields (dalErrorBody, fallbackCode) {
  const code = String(dalErrorBody?.extensions?.code ?? fallbackCode)
  return { code, message: safeErrorMessage(code, dalErrorBody?.message) }
}

function logFailure (level, operation, durationNs, { error, reason }, message) {
  logger[level](
    { event: { category: 'dal', action: operation, outcome: 'failure', duration: durationNs, reason }, error },
    message
  )
  serverMetrics.counter('DalFailures')
}

function recordDuration (operation, durationNs) {
  const durationMs = durationNs / NS_PER_MS
  serverMetrics.millis('DalRequestDuration', durationMs)
  serverMetrics.millis('DalOperationDuration', durationMs, { DalOperation: operation })
}

export async function queryDal (query, variables, { forwardedUserToken } = {}) {
  const operation = operationName(query)

  let bearerToken

  try {
    bearerToken = await getToken()
  } catch {
    // getToken has already logged and counted the failure
    throw dalError(UNAVAILABLE_MESSAGE, 'DAL_UNAVAILABLE')
  }

  const startedAt = process.hrtime.bigint()
  let response

  try {
    response = await fetch(
      config.get('dal.endpoint'),
      buildRequest(bearerToken, forwardedUserToken, query, variables)
    )
  } catch (err) {
    const code = networkErrorCode(err)
    logFailure(
      'error',
      operation,
      elapsedNs(startedAt),
      { error: { type: err.name, code, message: err.message, stack_trace: err.stack } },
      'DAL request failed'
    )
    if (code === 'TIMEOUT') {
      serverMetrics.counter('DalTimeouts')
    }
    throw dalError(UNAVAILABLE_MESSAGE, 'DAL_UNAVAILABLE')
  }

  recordDuration(operation, elapsedNs(startedAt))

  if (!response.ok) {
    // The DAL explains non-200 responses in the body, so keep that detail rather than discarding it.
    const errors = await readErrors(response)
    logFailure(
      response.status >= constants.HTTP_STATUS_INTERNAL_SERVER_ERROR ? 'error' : 'warn',
      operation,
      elapsedNs(startedAt),
      {
        reason: `DAL responded with HTTP ${response.status}`,
        error: dalErrorFields(errors[0], `HTTP_${response.status}`)
      },
      'DAL responded with a non-success status'
    )
    throw dalError(
      'The data access layer rejected the request',
      'DAL_REQUEST_REJECTED',
      {
        status: response.status,
        ...(errors.length && {
          dalMessage: errors[0].message,
          dalCode: errors[0].extensions?.code
        })
      }
    )
  }

  const body = await response.json()

  if (body.errors?.length) {
    logFailure(
      'error',
      operation,
      elapsedNs(startedAt),
      { error: dalErrorFields(body.errors[0], 'DAL_ERROR') },
      `DAL responded with ${body.errors.length} error(s)`
    )
    throw dalError(body.errors[0].message, body.errors[0].extensions?.code ?? 'DAL_ERROR')
  }

  return body.data
}
