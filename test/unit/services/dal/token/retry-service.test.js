import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { constants } from 'node:http2'

const cacheDrop = vi.fn()
const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

vi.mock('../../../../../src/common/helpers/caching/token-cache.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
  drop: (...args) => cacheDrop(...args)
}))

const { retry, tokenErrorFields } = await import('../../../../../src/services/dal/token/retry-service.js')
const { DAL_TOKEN_CACHE_KEY } = await import('../../../../../src/services/dal/token/constants.js')

function unauthorised () {
  const err = new Error('Unauthorized')
  err.output = { statusCode: constants.HTTP_STATUS_UNAUTHORIZED }
  return err
}

describe('retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheDrop.mockResolvedValue(undefined)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // The assertion has to be attached before the timers run, otherwise the
  // rejection surfaces as an unhandled promise rejection.
  async function settle (assertion) {
    await vi.runAllTimersAsync()
    await assertion
  }

  test('returns the result without retrying when the call succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('a token')

    await settle(expect(retry(fn)).resolves.toBe('a token'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries up to three times before giving up', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'))

    await settle(expect(retry(fn)).rejects.toThrow('nope'))
    expect(fn).toHaveBeenCalledTimes(4)
  })

  test('backs off exponentially between attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'))
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await settle(expect(retry(fn)).rejects.toThrow('nope'))

    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay)
    expect(delays).toEqual([1000, 2000, 4000])
  })

  test('uses a constant delay when exponential backoff is disabled', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('nope'))
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await settle(expect(retry(fn, 3, 500, false)).rejects.toThrow('nope'))

    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => delay)
    expect(delays).toEqual([500, 500, 500])
  })

  test('drops the cached token when the call is rejected as unauthorised', async () => {
    const fn = vi.fn().mockRejectedValueOnce(unauthorised()).mockResolvedValue('a token')

    await settle(expect(retry(fn)).resolves.toBe('a token'))
    expect(cacheDrop).toHaveBeenCalledWith(DAL_TOKEN_CACHE_KEY)
  })

  test('leaves the cached token alone for other failures', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue('a token')

    await settle(expect(retry(fn)).resolves.toBe('a token'))
    expect(cacheDrop).not.toHaveBeenCalled()
  })

  test('logs each retry with the error code', async () => {
    const fn = vi.fn().mockRejectedValueOnce(unauthorised()).mockResolvedValue('a token')

    await settle(expect(retry(fn)).resolves.toBe('a token'))
    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        event: { category: 'dal', action: 'dal-token', outcome: 'failure' },
        error: expect.objectContaining({ type: 'Error', code: String(constants.HTTP_STATUS_UNAUTHORIZED), message: 'Unauthorized' })
      },
      'Retrying DAL token request (3 retries left)'
    )
  })
})

describe('tokenErrorFields', () => {
  test('uses the socket error code Wreck keeps in data when Entra could not be reached', () => {
    const err = new Error('Client request error')
    err.output = { statusCode: constants.HTTP_STATUS_BAD_GATEWAY }
    err.data = { code: 'ECONNREFUSED' }

    expect(tokenErrorFields(err)).toMatchObject({ code: 'ECONNREFUSED', message: 'Client request error' })
  })

  test('uses Entra\'s status when it responded with an error', () => {
    expect(tokenErrorFields(unauthorised()).code).toBe(String(constants.HTTP_STATUS_UNAUTHORIZED))
  })

  test('falls back to the error\'s own code, then its name', () => {
    const coded = new Error('boom')
    coded.code = 'ENOTFOUND'

    expect(tokenErrorFields(coded).code).toBe('ENOTFOUND')
    expect(tokenErrorFields(new TypeError('boom')).code).toBe('TypeError')
  })
})
