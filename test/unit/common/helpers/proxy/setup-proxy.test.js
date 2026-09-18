import { describe, test, expect, vi, beforeEach } from 'vitest'

const setGlobalDispatcher = vi.fn()
const proxyAgentInstances = []
const bootstrap = vi.fn()

vi.mock('undici', () => ({
  ProxyAgent: vi.fn().mockImplementation(function ProxyAgent (url) {
    const instance = { url }
    proxyAgentInstances.push(instance)
    return instance
  }),
  setGlobalDispatcher: (...args) => setGlobalDispatcher(...args)
}))

vi.mock('global-agent', () => ({
  bootstrap: (...args) => bootstrap(...args)
}))

vi.mock('../../../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ info: vi.fn() })
}))

describe('setupProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    proxyAgentInstances.length = 0
    delete globalThis.GLOBAL_AGENT
  })

  test('does nothing when no proxy is configured', async () => {
    vi.doMock('../../../../../src/config.js', () => ({
      config: { get: (path) => (path === 'httpProxy' ? null : undefined) }
    }))

    const { setupProxy } = await import('../../../../../src/common/helpers/proxy/setup-proxy.js')
    setupProxy()

    expect(setGlobalDispatcher).not.toHaveBeenCalled()
    expect(bootstrap).not.toHaveBeenCalled()
  })

  test('configures a global proxy dispatcher and global-agent when a proxy is set', async () => {
    vi.doMock('../../../../../src/config.js', () => ({
      config: { get: (path) => (path === 'httpProxy' ? 'http://proxy.example.com:8080' : undefined) }
    }))
    globalThis.GLOBAL_AGENT = {}

    const { setupProxy } = await import('../../../../../src/common/helpers/proxy/setup-proxy.js')
    setupProxy()

    expect(setGlobalDispatcher).toHaveBeenCalledWith(proxyAgentInstances[0])
    expect(proxyAgentInstances[0].url).toBe('http://proxy.example.com:8080')
    expect(bootstrap).toHaveBeenCalled()
    expect(globalThis.GLOBAL_AGENT.HTTP_PROXY).toBe('http://proxy.example.com:8080')
  })
})
