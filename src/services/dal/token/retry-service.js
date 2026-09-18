import { createLogger } from '../../../common/helpers/logging/logger.js'
import { drop } from '../../../common/helpers/caching/token-cache.js'
import { DAL_TOKEN_CACHE_KEY } from './constants.js'

const logger = createLogger()

const UNAUTHORIZED = 401

function isUnauthorised (err) {
  return err?.output?.statusCode === UNAUTHORIZED
}

export async function retry (fn, retriesLeft = 3, interval = 1000, exponential = true) {
  try {
    return await fn()
  } catch (err) {
    // A rejected token is worth nothing, so make sure the next attempt fetches a fresh one.
    if (isUnauthorised(err)) {
      await drop(DAL_TOKEN_CACHE_KEY)
    }

    if (retriesLeft <= 0) {
      throw err
    }

    logger.warn({ err, retriesLeft }, 'Retrying DAL token request')
    await new Promise((resolve) => setTimeout(resolve, interval))

    return retry(fn, retriesLeft - 1, exponential ? interval * 2 : interval, exponential)
  }
}
