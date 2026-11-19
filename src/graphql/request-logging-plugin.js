import { constants } from 'node:http2'
import { Kind } from 'graphql'
import { createLogger } from '../common/helpers/logging/logger.js'
import { serverMetrics } from '../common/helpers/metrics.js'
import { getCallerClientId } from '../auth/user-token.js'

const logger = createLogger()

const SERVER_ERROR_CODES = new Set([
  'DAL_UNAVAILABLE',
  'DAL_ERROR',
  'INTERNAL_SERVER_ERROR',
  'INTERNAL SERVER ERROR',
  'BAD GATEWAY',
  'SERVICE UNAVAILABLE',
  'GATEWAY TIMEOUT'
])

const NS_PER_MS = 1e6

function errorCode (error) {
  const code = error.extensions?.code ?? 'INTERNAL_SERVER_ERROR'
  return typeof code === 'string' && /^[A-Z][A-Z_ ]{0,49}$/.test(code) ? code : 'OTHER'
}

function isServerError (error) {
  const code = errorCode(error)
  return SERVER_ERROR_CODES.has(code) ||
    (code === 'DAL_REQUEST_REJECTED' && error.extensions?.status >= constants.HTTP_STATUS_INTERNAL_SERVER_ERROR)
}

// Only read once Apollo has validated the operation: before that, field names are the caller's free text
function rootFields (operation) {
  const fieldsByResponseKey = new Map()
  for (const selection of operation?.selectionSet.selections ?? []) {
    if (selection.kind === Kind.FIELD && !selection.name.value.startsWith('__')) {
      fieldsByResponseKey.set(selection.alias?.value ?? selection.name.value, selection.name.value)
    }
  }
  return fieldsByResponseKey
}

function failedFields (errors, fieldsByResponseKey) {
  const failed = new Set()
  for (const error of errors) {
    const field = fieldsByResponseKey.get(error.path?.[0])
    if (field) {
      failed.add(field)
    } else {
      fieldsByResponseKey.forEach((name) => failed.add(name))
    }
  }
  return failed
}

// The message line of a stack can echo data (a JSON parse error quotes the body), so it is left out
function stackWithoutMessage (err) {
  const header = `${err.name}: ${err.message}`
  return err.stack?.startsWith(header) ? err.name + err.stack.slice(header.length) : undefined
}

function logUnexpectedErrors (errors) {
  for (const error of errors) {
    if (!error.extensions?.code) {
      const original = error.originalError ?? error
      logger.error(
        { event: { category: 'graphql', outcome: 'failure' }, error: { type: original.name, code: 'INTERNAL_SERVER_ERROR', stack_trace: stackWithoutMessage(original) } },
        'Unexpected error while resolving a GraphQL request'
      )
      serverMetrics.counter('UnexpectedErrors')
    }
  }
}

function logLevel (errors, hasServerError) {
  if (!errors.length) {
    return 'info'
  }
  return hasServerError ? 'error' : 'warn'
}

function recordMetrics (errors, fieldsByResponseKey, hasServerError) {
  serverMetrics.counter('GraphQLRequests')

  if (errors.length) {
    serverMetrics.counter(hasServerError ? 'GraphQLServerErrors' : 'GraphQLClientErrors')
  }

  for (const error of errors) {
    serverMetrics.counter('GraphQLErrors', 1, { ErrorCode: errorCode(error) })
  }

  const failed = failedFields(errors, fieldsByResponseKey)
  for (const field of new Set(fieldsByResponseKey.values())) {
    serverMetrics.counter('OperationRequests', 1, { Operation: field, Outcome: failed.has(field) ? 'failure' : 'success' })
  }
}

// Logs one line per request without variables, query text, response data or error messages.
// Codes stay out of the message: CDP obfuscates message text after words such as "USER".
export const requestLoggingPlugin = {
  async requestDidStart () {
    const startedAt = process.hrtime.bigint()

    return {
      async willSendResponse ({ operation, errors = [], contextValue }) {
        const durationNs = Number(process.hrtime.bigint() - startedAt)
        const fieldsByResponseKey = rootFields(operation)
        const fieldNames = [...new Set(fieldsByResponseKey.values())]
        const codes = [...new Set(errors.map(errorCode))]
        const hasServerError = errors.some(isServerError)
        const outcome = errors.length ? 'failure' : 'success'
        const action = fieldNames.join(',') || (operation ? 'introspection' : 'unknown')
        const clientId = getCallerClientId(contextValue?.forwardedUserToken)

        logUnexpectedErrors(errors)
        recordMetrics(errors, fieldsByResponseKey, hasServerError)

        const summary = errors.length ? 'failed' : 'succeeded'
        const durationMs = Math.round(durationNs / NS_PER_MS)

        logger[logLevel(errors, hasServerError)](
          {
            event: {
              category: 'graphql',
              type: operation?.operation,
              action,
              outcome,
              reason: codes.join(',') || undefined,
              duration: durationNs
            },
            ...(codes.length && { error: { code: codes[0] } }),
            ...(clientId && { tenant: { id: clientId } })
          },
          `GraphQL ${operation?.operation ?? 'request'} ${action} ${summary} in ${durationMs}ms`
        )
      }
    }
  }
}
