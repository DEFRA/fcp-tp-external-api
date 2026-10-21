import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import Hapi from '@hapi/hapi'
import { config } from '../../../src/config.js'
import { crnRestriction } from '../../../src/plugins/crn-restriction.js'

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }))

vi.mock('../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const ALLOWED_CRN = '1102634220'
const OTHER_CRN = '1111111902'

function jwt (payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`
}

let server

beforeEach(async () => {
  config.set('crnRestriction.isEnabled', true)
  config.set('crnRestriction.allowedCrns', [ALLOWED_CRN])

  server = Hapi.server()
  await server.register(crnRestriction)
  server.route([
    { method: 'POST', path: config.get('graphql.path'), handler: () => ({ data: 'real data' }) },
    { method: 'GET', path: '/health', handler: () => ({ message: 'success' }) }
  ])
})

afterEach(() => {
  config.set('crnRestriction.isEnabled', false)
  config.set('crnRestriction.allowedCrns', [])
})

function post (headers = {}) {
  return server.inject({ method: 'POST', url: config.get('graphql.path'), headers })
}

describe('crn restriction', () => {
  test('lets through a token for an allowed CRN', async () => {
    const response = await post({ 'x-forwarded-authorization': jwt({ contactId: ALLOWED_CRN }) })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ data: 'real data' })
  })

  test('accepts the token in the authorization header and with a Bearer prefix', async () => {
    const response = await post({ authorization: `Bearer ${jwt({ contactId: ALLOWED_CRN })}` })

    expect(response.statusCode).toBe(200)
  })

  test('refuses a token for a CRN that is not allowed with a 403', async () => {
    const response = await post({ 'x-forwarded-authorization': jwt({ contactId: OTHER_CRN }) })

    expect(response.statusCode).toBe(403)
    expect(response.result).toEqual({
      errors: [{
        message: 'The signed-in user does not have permission to access this data',
        extensions: { code: 'FORBIDDEN' }
      }]
    })
  })

  test.each([
    ['there is no token', {}],
    ['the token is not a JWT', { 'x-forwarded-authorization': 'not-a-jwt' }],
    ['the token has no contactId', { 'x-forwarded-authorization': jwt({ sub: 'someone' }) }]
  ])('refuses the request when %s', async (_name, headers) => {
    const response = await post(headers)

    expect(response.statusCode).toBe(403)
    expect(response.result.errors[0].extensions.code).toBe('FORBIDDEN')
  })

  test('does not reveal which CRNs are allowed', async () => {
    const response = await post({ 'x-forwarded-authorization': jwt({ contactId: OTHER_CRN }) })

    expect(response.payload).not.toContain(ALLOWED_CRN)
    expect(response.payload).not.toContain(OTHER_CRN)
  })

  test('refuses every request when the allow-list is empty', async () => {
    config.set('crnRestriction.allowedCrns', [])

    const response = await post({ 'x-forwarded-authorization': jwt({ contactId: ALLOWED_CRN }) })

    expect(response.statusCode).toBe(403)
  })

  test('allows any CRN, with or without a token, when restriction is disabled', async () => {
    config.set('crnRestriction.isEnabled', false)

    expect((await post({ 'x-forwarded-authorization': jwt({ contactId: OTHER_CRN }) })).statusCode).toBe(200)
    expect((await post()).statusCode).toBe(200)
  })

  test('does not apply to routes other than the GraphQL endpoint', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
  })

  test('reads the settings on each request', async () => {
    const headers = { 'x-forwarded-authorization': jwt({ contactId: OTHER_CRN }) }
    expect((await post(headers)).statusCode).toBe(403)

    config.set('crnRestriction.allowedCrns', [OTHER_CRN])

    expect((await post(headers)).statusCode).toBe(200)
  })

  describe('logging', () => {
    async function register () {
      await Hapi.server().register(crnRestriction)
    }

    test('logs the number of allowed CRNs, not the CRNs, at startup', async () => {
      mockLogger.info.mockClear()

      await register()

      expect(mockLogger.info).toHaveBeenCalledWith('CRN restriction is enabled for 1 allowed CRN(s)')
    })

    test('warns at startup when restriction is enabled with an empty allow-list', async () => {
      config.set('crnRestriction.allowedCrns', [])

      await register()

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('ALLOWED_CRNS is empty'))
    })

    test('warns at startup when restriction is disabled', async () => {
      config.set('crnRestriction.isEnabled', false)

      await register()

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('disabled'))
    })

    test('logs a refusal with the reason and a masked CRN, never the token', async () => {
      const token = jwt({ contactId: OTHER_CRN })

      await post({ 'x-forwarded-authorization': token })

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          event: { action: 'crn-restriction', outcome: 'failure', reason: 'not-allowed' },
          user: { id: '******1902' }
        },
        'Request refused by CRN restriction'
      )
      expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain(token)
      expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain(OTHER_CRN)
    })

    test.each([
      ['no-token', {}],
      ['invalid-token', { 'x-forwarded-authorization': 'not-a-jwt' }]
    ])('logs the %s reason with no CRN', async (reason, headers) => {
      await post(headers)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { event: { action: 'crn-restriction', outcome: 'failure', reason } },
        'Request refused by CRN restriction'
      )
    })
  })
})
