import Wreck from '@hapi/wreck'
import { config } from '../../../config.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import { get, set } from '../../../common/helpers/caching/token-cache.js'
import { retry } from './retry-service.js'
import { DAL_TOKEN_CACHE_KEY, TOKEN_EXPIRY_BUFFER_MS } from './constants.js'

const logger = createLogger()

const millisecondsPerSecond = 1000

async function requestNewToken () {
  const { clientId, clientSecret, tokenEndpoint } = config.get('dal')

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: `${clientId}/.default`
  })

  const { payload } = await Wreck.post(tokenEndpoint, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    payload: form.toString(),
    json: true
  })

  return {
    token: `${payload.token_type} ${payload.access_token}`,
    expiresInMs: payload.expires_in * millisecondsPerSecond
  }
}

async function getCachedOrNewToken () {
  const cachedToken = await get(DAL_TOKEN_CACHE_KEY)

  if (cachedToken) {
    return cachedToken
  }

  logger.info('DAL token cache miss, requesting a new token from Entra')

  const { token, expiresInMs } = await requestNewToken()
  const ttl = expiresInMs - TOKEN_EXPIRY_BUFFER_MS

  if (ttl > 0) {
    await set(DAL_TOKEN_CACHE_KEY, token, ttl)
  }

  return token
}

export function getToken () {
  return retry(getCachedOrNewToken)
}
