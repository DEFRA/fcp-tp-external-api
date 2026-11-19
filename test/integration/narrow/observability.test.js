import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { constants } from 'node:http2'
import { dalResponses, mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'
import { getToken } from '../../../src/services/dal/token/get-token-service.js'

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn()
}))

vi.mock('../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const CUSTOMER_QUERY = 'query Customer($crn: ID!) { customer(crn: $crn) { crn info { email { address } } } }'
const CRN = '1234567890'

let server

beforeAll(async () => {
  server = await createServer()
  await server.initialize()
})

afterAll(async () => {
  await server.stop({ timeout: 0 })
  await stopApolloServer()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function graphqlLogs () {
  return [...mockLogger.info.mock.calls, ...mockLogger.warn.mock.calls, ...mockLogger.error.mock.calls]
    .filter(([fields]) => fields?.event?.category === 'graphql')
}

describe('GraphQL request logging', () => {
  test('logs one line for a request without its variables or response data', async () => {
    mockDal({ customer: dalResponses.customer })

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN })

    expect(graphqlLogs()).toHaveLength(1)
    expect(graphqlLogs()[0][0].event).toMatchObject({ type: 'query', action: 'customer', outcome: 'success' })
    const logged = JSON.stringify(mockLogger.info.mock.calls)
    expect(logged).not.toContain(CRN)
    expect(logged).not.toContain(dalResponses.customer.info.email.address)
  })

  test('logs a rejected variable by code alone, as its message repeats the value', async () => {
    const value = { not: 'a crn', email: 'someone@example.com' }

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: value })

    expect(JSON.parse(response.payload).errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(graphqlLogs()[0][0].error).toEqual({ code: 'BAD_USER_INPUT' })
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain('someone@example.com')
  })
})

describe('Entra token failure', () => {
  test('reaches the caller as DAL_UNAVAILABLE without the Entra error', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })
    getToken.mockRejectedValueOnce(new Error('Response Error: 401 Unauthorized'))

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN })
    const { errors } = JSON.parse(response.payload)

    expect(errors[0].message).toBe('The data access layer could not be reached')
    expect(errors[0].extensions.code).toBe('DAL_UNAVAILABLE')
    expect(response.payload).not.toContain(String(constants.HTTP_STATUS_UNAUTHORIZED))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(graphqlLogs()[0][0].error).toEqual({ code: 'DAL_UNAVAILABLE' })
  })
})

describe('trace ID response header', () => {
  test('returns the trace ID the request arrived with', async () => {
    mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, { 'x-cdp-request-id': 'trace-1' })

    expect(response.headers['x-cdp-request-id']).toBe('trace-1')
  })

  test('returns a generated trace ID when the request had none', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.headers['x-cdp-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('returns the trace ID on error responses', async () => {
    const response = await server.inject({ method: 'GET', url: '/not-a-route', headers: { 'x-cdp-request-id': 'trace-2' } })

    expect(response.statusCode).toBe(constants.HTTP_STATUS_NOT_FOUND)
    expect(response.headers['x-cdp-request-id']).toBe('trace-2')
  })
})
