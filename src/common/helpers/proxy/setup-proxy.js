import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { bootstrap } from 'global-agent'
import { config } from '../../../config.js'
import { createLogger } from '../logging/logger.js'

const logger = createLogger()

export function setupProxy () {
  const proxyUrl = config.get('httpProxy')

  if (!proxyUrl) {
    return
  }

  logger.info('Setting up global proxies')

  // Covers native fetch, which the DAL connector uses.
  setGlobalDispatcher(new ProxyAgent(proxyUrl))

  // Covers http/https core modules, which Wreck uses.
  bootstrap()
  globalThis.GLOBAL_AGENT.HTTP_PROXY = proxyUrl
}
