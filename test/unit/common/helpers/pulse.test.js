import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ info: vi.fn() })
}))

describe('pulse', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('uses a short timeout in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const { pulse } = await import('../../../../src/common/helpers/pulse.js')

    expect(pulse.options.timeout).toBe(1000)
    vi.unstubAllEnvs()
  })

  test('uses a long timeout in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const { pulse } = await import('../../../../src/common/helpers/pulse.js')

    expect(pulse.options.timeout).toBe(10 * 1000)
    vi.unstubAllEnvs()
  })
})
