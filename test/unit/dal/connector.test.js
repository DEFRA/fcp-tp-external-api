import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { constants } from 'node:http2'

const {
  HTTP_STATUS_OK,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_BAD_GATEWAY
} = constants

const getToken = vi.fn()
const mockLogger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }))

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: (...args) => getToken(...args)
}))

vi.mock('../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const { queryDal } = await import('../../../src/dal/connector.js')
const { serverMetrics } = await import('../../../src/common/helpers/metrics.js')

function jsonResponse (body, { ok = true, status = HTTP_STATUS_OK } = {}) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) }
}

describe('queryDal', () => {
  beforeEach(() => {
    getToken.mockResolvedValue('Bearer a-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { business: { sbi: '123456789' } } })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('posts the query and variables to the DAL', async () => {
    await queryDal('query Business { business { sbi } }', { sbi: '123456789' })

    const [endpoint, options] = fetch.mock.calls[0]
    expect(endpoint).toBe('http://localhost:3000/graphql')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      query: 'query Business { business { sbi } }',
      variables: { sbi: '123456789' }
    })
  })

  test('identifies this service with its own token and routes via the external gateway', async () => {
    await queryDal('query {}', {})

    const [, options] = fetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer a-token')
    expect(options.headers['gateway-type']).toBe('external')
  })

  test('forwards the caller token to the DAL', async () => {
    await queryDal('query {}', {}, { forwardedUserToken: 'Bearer a-defra-id-token' })

    const [, options] = fetch.mock.calls[0]
    expect(options.headers['x-forwarded-authorization']).toBe('Bearer a-defra-id-token')
  })

  test('omits the forwarded header when the caller sent no token', async () => {
    await queryDal('query {}', {})

    const [, options] = fetch.mock.calls[0]
    expect(options.headers).not.toHaveProperty('x-forwarded-authorization')
  })

  test('returns the data from the DAL response', async () => {
    const data = await queryDal('query {}', {})

    expect(data).toEqual({ business: { sbi: '123456789' } })
  })

  test('reports an unreachable DAL', async () => {
    fetch.mockRejectedValue(new Error('connect ECONNREFUSED'))

    await expect(queryDal('query {}', {})).rejects.toMatchObject({
      message: 'The data access layer could not be reached',
      extensions: { code: 'DAL_UNAVAILABLE' }
    })
  })

  test('reports a rejected request', async () => {
    fetch.mockResolvedValue(jsonResponse({}, { ok: false, status: HTTP_STATUS_FORBIDDEN }))

    await expect(queryDal('query {}', {})).rejects.toMatchObject({
      extensions: { code: 'DAL_REQUEST_REJECTED', status: HTTP_STATUS_FORBIDDEN }
    })
  })

  test('keeps the DAL explanation when a non-200 response carries errors', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        { errors: [{ message: 'Customer not found', extensions: { code: 'NOT_FOUND' } }], data: { customer: null } },
        { ok: false, status: HTTP_STATUS_NOT_FOUND }
      )
    )

    await expect(queryDal('query {}', {})).rejects.toMatchObject({
      extensions: {
        code: 'DAL_REQUEST_REJECTED',
        status: HTTP_STATUS_NOT_FOUND,
        dalMessage: 'Customer not found',
        dalCode: 'NOT_FOUND'
      }
    })
  })

  test('reports a rejected request when the body is not valid JSON', async () => {
    fetch.mockResolvedValue({ ok: false, status: HTTP_STATUS_BAD_GATEWAY, text: async () => '<html>Bad Gateway</html>' })

    const error = await queryDal('query {}', {}).catch((err) => err)

    expect(error.extensions).toEqual({ code: 'DAL_REQUEST_REJECTED', status: HTTP_STATUS_BAD_GATEWAY })
  })

  test('surfaces errors returned in the DAL response body', async () => {
    fetch.mockResolvedValue(
      jsonResponse({ errors: [{ message: 'Business not found', extensions: { code: 'NOT_FOUND' } }] })
    )

    await expect(queryDal('query {}', {})).rejects.toMatchObject({
      message: 'Business not found',
      extensions: { code: 'NOT_FOUND' }
    })
  })

  test('falls back to a generic error code when the DAL error has none', async () => {
    fetch.mockResolvedValue(jsonResponse({ errors: [{ message: 'Something went wrong' }] }))

    await expect(queryDal('query {}', {})).rejects.toMatchObject({
      message: 'Something went wrong',
      extensions: { code: 'DAL_ERROR' }
    })
  })
})

describe('queryDal logging and metrics', () => {
  const query = 'query Business($sbi: ID!) { business(sbi: $sbi) { sbi } }'

  beforeEach(() => {
    getToken.mockResolvedValue('Bearer a-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { business: { sbi: '123456789' } } })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function loggedCalls () {
    return [...mockLogger.error.mock.calls, ...mockLogger.warn.mock.calls]
  }

  function loggedFields () {
    return loggedCalls()[0][0]
  }

  test('records the duration of each DAL call against its operation', async () => {
    await queryDal(query, { sbi: '123456789' })

    expect(serverMetrics.millis).toHaveBeenCalledWith('DalRequestDuration', expect.any(Number))
    expect(serverMetrics.millis).toHaveBeenCalledWith('DalOperationDuration', expect.any(Number), { DalOperation: 'Business' })
    expect(loggedCalls()).toHaveLength(0)
  })

  test('reports a token failure as an unavailable DAL without calling it or logging again', async () => {
    getToken.mockRejectedValue(new Error('Response Error: 401 Unauthorized'))

    const error = await queryDal(query, {}).catch((err) => err)

    expect(error.message).toBe('The data access layer could not be reached')
    expect(error.extensions).toEqual({ code: 'DAL_UNAVAILABLE' })
    expect(fetch).not.toHaveBeenCalled()
    expect(loggedCalls()).toHaveLength(0)
  })

  test('logs the socket error code when the DAL cannot be reached', async () => {
    fetch.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }))

    await queryDal(query, {}).catch(() => {})

    expect(mockLogger.error).toHaveBeenCalled()
    expect(loggedFields()).toMatchObject({
      event: { category: 'dal', action: 'Business', outcome: 'failure', duration: expect.any(Number) },
      error: { type: 'TypeError', code: 'ECONNREFUSED', message: 'fetch failed' }
    })
    expect(serverMetrics.counter).toHaveBeenCalledWith('DalFailures')
    expect(serverMetrics.counter).not.toHaveBeenCalledWith('DalTimeouts')
  })

  test('logs and counts a timeout', async () => {
    fetch.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    await queryDal(query, {}).catch(() => {})

    expect(loggedFields().error.code).toBe('TIMEOUT')
    expect(serverMetrics.counter).toHaveBeenCalledWith('DalFailures')
    expect(serverMetrics.counter).toHaveBeenCalledWith('DalTimeouts')
  })

  test('logs the DAL code and status of a rejected request at warn, without using the service\'s own status field', async () => {
    fetch.mockResolvedValue(
      jsonResponse({ errors: [{ message: 'Customer not found', extensions: { code: 'NOT FOUND' } }] }, { ok: false, status: HTTP_STATUS_NOT_FOUND })
    )

    await queryDal(query, {}).catch(() => {})

    expect(mockLogger.error).not.toHaveBeenCalled()
    expect(loggedFields()).toMatchObject({
      event: { action: 'Business', outcome: 'failure', reason: `DAL responded with HTTP ${HTTP_STATUS_NOT_FOUND}` },
      error: { code: 'NOT FOUND', message: 'Customer not found' }
    })
    expect(loggedFields()).not.toHaveProperty('http')
    expect(serverMetrics.counter).toHaveBeenCalledWith('DalFailures')
  })

  test('logs a 5xx rejection at error, falling back to the HTTP status as the code when there is no body', async () => {
    fetch.mockResolvedValue({ ok: false, status: HTTP_STATUS_BAD_GATEWAY, text: async () => '<html>Bad Gateway</html>' })

    await queryDal(query, {}).catch(() => {})

    expect(mockLogger.error).toHaveBeenCalled()
    expect(loggedFields().error).toEqual({ code: `HTTP_${HTTP_STATUS_BAD_GATEWAY}`, message: undefined })
  })

  test.each([
    ['a rejected request', { ok: false, status: HTTP_STATUS_BAD_REQUEST }],
    ['an error response', { ok: true, status: HTTP_STATUS_OK }]
  ])('never logs the message of an input error in %s, as it can repeat the input', async (_name, status) => {
    const message = 'Variable "$input" got invalid value "someone@example.com" at "input.email"'
    fetch.mockResolvedValue(jsonResponse({ errors: [{ message, extensions: { code: 'BAD_USER_INPUT' } }] }, status))

    await queryDal(query, {}).catch(() => {})

    expect(loggedFields().error).toEqual({ code: 'BAD_USER_INPUT', message: undefined })
    expect(JSON.stringify(loggedCalls())).not.toContain('someone@example.com')
  })

  test('logs the code and message of errors in a successful response', async () => {
    fetch.mockResolvedValue(jsonResponse({ errors: [{ message: 'FRN not found for business', extensions: { code: 'NOT FOUND' } }] }))

    await queryDal(query, {}).catch(() => {})

    expect(mockLogger.error).toHaveBeenCalled()
    expect(loggedFields()).toMatchObject({
      event: { action: 'Business', outcome: 'failure' },
      error: { code: 'NOT FOUND', message: 'FRN not found for business' }
    })
    expect(serverMetrics.counter).toHaveBeenCalledWith('DalFailures')
  })

  test('names the operation unknown when the query has no name', async () => {
    await queryDal('{ business { sbi } }', {})

    expect(serverMetrics.millis).toHaveBeenCalledWith('DalOperationDuration', expect.any(Number), { DalOperation: 'unknown' })
  })
})
