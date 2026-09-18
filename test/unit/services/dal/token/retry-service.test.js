import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const cacheDrop = vi.fn()

vi.mock('../../../../../src/common/helpers/caching/token-cache.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
  drop: (...args) => cacheDrop(...args)
}))

const { retry } = await import('../../../../../src/services/dal/token/retry-service.js')
const { DAL_TOKEN_CACHE_KEY } = await import('../../../../../src/services/dal/token/constants.js')

function unauthorised () {
  const err = new Error('Unauthorized')
  err.output = { statusCode: 401 }
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
})
