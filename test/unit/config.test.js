import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Writable } from 'node:stream'
import pino from 'pino'

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
      'req.headers["x-forwarded-authorization"]',
      'req.headers.cookie',
      'req.query',
      'res.headers'
    ])

    vi.unstubAllEnvs()
  })

  test('keeps the forwarded Defra ID token and query string out of production request logs', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const { config } = await import('../../src/config.js')

    let output = ''
    const stream = new Writable({
      write (chunk, _encoding, callback) {
        output += chunk
        callback()
      }
    })
    const logger = pino({ redact: { paths: config.get('log.redact'), remove: true } }, stream)

    logger.info({
      req: {
        url: '/graphql',
        query: { variables: '{"crn":"1000000001"}' },
        headers: { 'x-forwarded-authorization': 'a-defra-id-token', 'user-agent': 'curl' }
      }
    }, 'request completed')

    expect(output).toContain('user-agent')
    expect(output).not.toContain('a-defra-id-token')
    expect(output).not.toContain('1000000001')

    vi.unstubAllEnvs()
  })

  describe('auditing', () => {
    test('is disabled by default', async () => {
      vi.stubEnv('AUDIT_ENABLED', undefined)

      const { config } = await import('../../src/config.js')

      expect(config.get('audit.isEnabled')).toBe(false)
    })

    test('stops startup when enabled without a topic', async () => {
      vi.stubEnv('AUDIT_ENABLED', 'true')
      vi.stubEnv('AUDIT_SNS_TOPIC_ARN', undefined)

      await expect(import('../../src/config.js')).rejects.toThrow(
        'audit.snsTopicArn: must be set when AUDIT_ENABLED is true'
      )
    })

    test('starts when enabled with a topic', async () => {
      vi.stubEnv('AUDIT_ENABLED', 'true')
      vi.stubEnv('AUDIT_SNS_TOPIC_ARN', 'arn:aws:sns:eu-west-2:000000000000:audit')

      const { config } = await import('../../src/config.js')

      expect(config.get('audit.snsTopicArn')).toBe('arn:aws:sns:eu-west-2:000000000000:audit')
    })
  })

  describe('Entra credentials', () => {
    test('are optional when DAL auth is disabled', async () => {
      vi.stubEnv('DAL_DISABLE_AUTH', 'true')
      vi.stubEnv('DAL_TENANT_ID', undefined)
      vi.stubEnv('DAL_TOKEN_ENDPOINT', undefined)
      vi.stubEnv('DAL_CLIENT_ID', undefined)
      vi.stubEnv('DAL_CLIENT_SECRET', undefined)

      const { config } = await import('../../src/config.js')

      expect(config.get('dal.clientId')).toBeNull()
    })

    test('stops startup when missing and DAL auth is enabled', async () => {
      vi.stubEnv('DAL_DISABLE_AUTH', 'false')
      vi.stubEnv('DAL_TOKEN_ENDPOINT', undefined)
      vi.stubEnv('DAL_CLIENT_SECRET', '')

      await expect(import('../../src/config.js')).rejects.toThrow(
        'dal.tokenEndpoint, dal.clientSecret: must be set unless DAL_DISABLE_AUTH is true'
      )
    })
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
      vi.stubEnv('ALLOWED_CRNS', ' 1000000001, 1000000002 ,,')

      const { config } = await import('../../src/config.js')

      expect(config.get('crnRestriction.allowedCrns')).toEqual(['1000000001', '1000000002'])
    })

    test('treats a blank ALLOWED_CRNS as an empty list', async () => {
      vi.stubEnv('ALLOWED_CRNS', '')

      const { config } = await import('../../src/config.js')

      expect(config.get('crnRestriction.allowedCrns')).toEqual([])
    })

    test.each([
      ['too short', '12345'],
      ['too long', '10000000011'],
      ['not numeric', '10000000AB'],
      ['starting with zero', '0123456789']
    ])('stops startup when ALLOWED_CRNS contains a CRN that is %s', async (_name, crn) => {
      vi.stubEnv('ALLOWED_CRNS', `1000000001,${crn}`)

      await expect(import('../../src/config.js')).rejects.toThrow('crnRestriction.allowedCrns')
    })

    test('does not print the allowed CRNs in the config string', async () => {
      vi.stubEnv('ALLOWED_CRNS', '1000000001')

      const { config } = await import('../../src/config.js')

      expect(config.toString()).not.toContain('1000000001')
    })
  })
})
