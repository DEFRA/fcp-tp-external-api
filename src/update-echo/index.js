import { createLogger } from '../common/helpers/logging/logger.js'
import { config } from '../config.js'
import * as echoCache from '../common/helpers/caching/update-echo-cache.js'
import { mergeFragment } from './merge.js'

const logger = createLogger()

// Pointless without sanitization: there would be nothing to echo past.
function isEchoEnabled () {
  return config.get('updateEcho.isEnabled') && config.get('sanitize.isEnabled')
}

function cacheId (kind, id) {
  return `${kind}:${id}`
}

export async function rememberUpdate (kind, id, fragment) {
  if (!isEchoEnabled() || !fragment || Object.keys(fragment).length === 0) {
    return
  }

  try {
    const existing = await echoCache.get(cacheId(kind, id))
    const merged = mergeFragment(existing ?? {}, fragment)
    await echoCache.set(cacheId(kind, id), merged, config.get('updateEcho.ttlMs'))
  } catch (error) {
    logger.warn(error, 'Failed to remember update for the update echo cache')
  }
}

export async function applyRecentUpdate (kind, id, entity) {
  if (!isEchoEnabled() || !entity) {
    return entity
  }

  try {
    const fragment = await echoCache.get(cacheId(kind, id))
    return fragment ? mergeFragment(entity, fragment) : entity
  } catch (error) {
    logger.warn(error, 'Failed to apply the update echo cache')
    return entity
  }
}
