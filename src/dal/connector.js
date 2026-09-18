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
    logger.error({ status: response.status }, 'DAL responded with a non-success status')
    throw dalError(
      'The data access layer rejected the request',
      'DAL_REQUEST_REJECTED',
      { status: response.status }
    )
  }

  const body = await response.json()

  if (body.errors?.length) {
    logger.error({ errors: body.errors }, 'DAL responded with errors')
    throw dalError(body.errors[0].message, body.errors[0].extensions?.code ?? 'DAL_ERROR')
  }

  return body.data
}
