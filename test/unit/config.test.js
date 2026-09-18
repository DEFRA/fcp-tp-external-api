import { describe, test, expect, vi, beforeEach } from 'vitest'

describe('config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('defaults to ecs logging and redacts auth headers in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const { config } = await import('../../src/config.js')

    expect(config.get('log.format')).toBe('ecs')
    expect(config.get('log.redact')).toEqual([
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers'
    ])

    vi.unstubAllEnvs()
  })
})
