import { constants } from 'node:http2'
import { createLogger } from '../../../common/helpers/logging/logger.js'
import { drop } from '../../../common/helpers/caching/token-cache.js'
import { DAL_TOKEN_CACHE_KEY } from './constants.js'

const logger = createLogger()

function isUnauthorised (err) {
  return err?.output?.statusCode === constants.HTTP_STATUS_UNAUTHORIZED
}

// Wreck errors are Booms: output.statusCode is Entra's status, or a bad gateway with the socket error in data
export function tokenErrorFields (err) {
  return {
    type: err?.name,
    code: String(err?.data?.code ?? err?.output?.statusCode ?? err?.code ?? err?.name),
    message: err?.message,
    stack_trace: err?.stack
  }
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

    logger.warn(
      { event: { category: 'dal', action: 'dal-token', outcome: 'failure' }, error: tokenErrorFields(err) },
      `Retrying DAL token request (${retriesLeft} retries left)`
    )
    await new Promise((resolve) => setTimeout(resolve, interval))

    return retry(fn, retriesLeft - 1, exponential ? interval * 2 : interval, exponential)
  }
}
