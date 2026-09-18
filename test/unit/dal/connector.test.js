import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const getToken = vi.fn()

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: (...args) => getToken(...args)
}))

const { queryDal } = await import('../../../src/dal/connector.js')

function jsonResponse (body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body }
}

describe('queryDal', () => {
  beforeEach(() => {
    getToken.mockResolvedValue('Bearer a-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { business: { sbi: '107183280' } } })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('posts the query and variables to the DAL', async () => {
    await queryDal('query Business { business { sbi } }', { sbi: '107183280' })

    const [endpoint, options] = fetch.mock.calls[0]
    expect(endpoint).toBe('http://localhost:3000/graphql')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      query: 'query Business { business { sbi } }',
      variables: { sbi: '107183280' }
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

    expect(data).toEqual({ business: { sbi: '107183280' } })
  })

  test('reports an unreachable DAL', async () => {
    fetch.mockRejectedValue(new Error('connect ECONNREFUSED'))

    await expect(queryDal('query {}', {})).rejects.toMatchObject({
      message: 'The data access layer could not be reached',
      extensions: { code: 'DAL_UNAVAILABLE' }
    })
  })

  test('reports a rejected request', async () => {
    fetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 403 }))

    await expect(queryDal('query {}', {})).rejects.toMatchObject({
      extensions: { code: 'DAL_REQUEST_REJECTED', status: 403 }
    })
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
})
