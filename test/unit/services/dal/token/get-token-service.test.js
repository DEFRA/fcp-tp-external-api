import { describe, test, expect, vi, beforeEach } from 'vitest'

const wreckPost = vi.fn()
const cacheGet = vi.fn()
const cacheSet = vi.fn()
const cacheDrop = vi.fn()

vi.mock('@hapi/wreck', () => ({
  default: { post: (...args) => wreckPost(...args) }
}))

vi.mock('../../../../../src/common/helpers/caching/token-cache.js', () => ({
  get: (...args) => cacheGet(...args),
  set: (...args) => cacheSet(...args),
  drop: (...args) => cacheDrop(...args)
}))

const { getToken } = await import('../../../../../src/services/dal/token/get-token-service.js')
const { TOKEN_EXPIRY_BUFFER_MS, DAL_TOKEN_CACHE_KEY } = await import('../../../../../src/services/dal/token/constants.js')

const tokenResponse = {
  payload: { token_type: 'Bearer', access_token: 'an-access-token', expires_in: 3600 }
}

describe('getToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheGet.mockResolvedValue(null)
    cacheSet.mockResolvedValue(undefined)
    cacheDrop.mockResolvedValue(undefined)
    wreckPost.mockResolvedValue(tokenResponse)
  })

  test('returns the cached token without calling Entra', async () => {
    cacheGet.mockResolvedValue('Bearer a-cached-token')

    expect(await getToken()).toBe('Bearer a-cached-token')
    expect(wreckPost).not.toHaveBeenCalled()
  })

  test('requests a new token on a cache miss', async () => {
    expect(await getToken()).toBe('Bearer an-access-token')

    const [endpoint, options] = wreckPost.mock.calls[0]
    expect(endpoint).toBe(
      'https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token'
    )
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

    const form = new URLSearchParams(options.payload)
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('client_id')).toBe('test-client-id')
    expect(form.get('client_secret')).toBe('test-client-secret')
    expect(form.get('scope')).toBe('test-client-id/.default')
  })

  test('caches the new token, expiring it before Entra does', async () => {
    await getToken()

    expect(cacheSet).toHaveBeenCalledWith(
      DAL_TOKEN_CACHE_KEY,
      'Bearer an-access-token',
      (3600 * 1000) - TOKEN_EXPIRY_BUFFER_MS
    )
  })

  test('does not cache a token that has already passed the expiry buffer', async () => {
    wreckPost.mockResolvedValue({
      payload: { ...tokenResponse.payload, expires_in: 10 }
    })

    expect(await getToken()).toBe('Bearer an-access-token')
    expect(cacheSet).not.toHaveBeenCalled()
  })

  test('retries a failing token request', async () => {
    wreckPost
      .mockRejectedValueOnce(new Error('Entra is having a moment'))
      .mockResolvedValue(tokenResponse)

    expect(await getToken()).toBe('Bearer an-access-token')
    expect(wreckPost).toHaveBeenCalledTimes(2)
  })
})
