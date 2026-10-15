import { describe, test, expect, vi, beforeEach } from 'vitest'

describe('config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
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

  describe('CRN restriction', () => {
    test('is enabled by default with an empty allow-list', async () => {
      vi.stubEnv('RESTRICT_CRNS', undefined)
      vi.stubEnv('ALLOWED_CRNS', undefined)

      const { config } = await import('../../src/config.js')

      expect(config.get('crnRestriction.isEnabled')).toBe(true)
      expect(config.get('crnRestriction.allowedCrns')).toEqual([])
    })

    test('can be turned off with RESTRICT_CRNS=false', async () => {
      vi.stubEnv('RESTRICT_CRNS', 'false')

      const { config } = await import('../../src/config.js')

      expect(config.get('crnRestriction.isEnabled')).toBe(false)
    })

    test('parses ALLOWED_CRNS as a comma separated list, ignoring spaces and blank entries', async () => {
      vi.stubEnv('ALLOWED_CRNS', ' 1102634220, 1111111902 ,,')

      const { config } = await import('../../src/config.js')

      expect(config.get('crnRestriction.allowedCrns')).toEqual(['1102634220', '1111111902'])
    })

    test('treats a blank ALLOWED_CRNS as an empty list', async () => {
      vi.stubEnv('ALLOWED_CRNS', '')

      const { config } = await import('../../src/config.js')

      expect(config.get('crnRestriction.allowedCrns')).toEqual([])
    })

    test.each([
      ['too short', '12345'],
      ['too long', '11026342201'],
      ['not numeric', '11026342AB'],
      ['starting with zero', '0102634220']
    ])('stops startup when ALLOWED_CRNS contains a CRN that is %s', async (_name, crn) => {
      vi.stubEnv('ALLOWED_CRNS', `1102634220,${crn}`)

      await expect(import('../../src/config.js')).rejects.toThrow('crnRestriction.allowedCrns')
    })

    test('does not print the allowed CRNs in the config string', async () => {
      vi.stubEnv('ALLOWED_CRNS', '1102634220')

      const { config } = await import('../../src/config.js')

      expect(config.toString()).not.toContain('1102634220')
    })
  })
})
