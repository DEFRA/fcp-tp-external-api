import { GraphQLError } from 'graphql'
import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { getToken } from '../services/dal/token/get-token-service.js'

const logger = createLogger()

function buildRequest (bearerToken, forwardedUserToken, query, variables) {
  const headers = {
    'Content-Type': 'application/json',
    'gateway-type': config.get('dal.gatewayType'),
    Authorization: bearerToken
  }

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

export async function queryDal (query, variables, { forwardedUserToken } = {}) {
  const bearerToken = await getToken()

  let response

  try {
    response = await fetch(
      config.get('dal.endpoint'),
      buildRequest(bearerToken, forwardedUserToken, query, variables)
    )
  } catch (err) {
    logger.error(err, 'DAL request failed')
    throw dalError('The data access layer could not be reached', 'DAL_UNAVAILABLE')
  }

  if (!response.ok) {
    // The DAL explains non-200 responses in the body, so keep that detail rather than discarding it.
    const errors = await readErrors(response)
    logger.error(
      {
        http: { response: { status_code: response.status } },
        error: { code: errors[0]?.extensions?.code, message: errors[0]?.message }
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
    logger.error(
      { error: { code: body.errors[0].extensions?.code, message: body.errors[0].message } },
      `DAL responded with ${body.errors.length} error(s)`
    )
    throw dalError(body.errors[0].message, body.errors[0].extensions?.code ?? 'DAL_ERROR')
  }

  return body.data
}
