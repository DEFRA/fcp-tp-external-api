import { describe, test, expect, vi, beforeEach } from 'vitest'

const cacheGet = vi.fn()
const cacheSet = vi.fn()

vi.mock('../../../src/common/helpers/caching/update-echo-cache.js', () => ({
  get: (...args) => cacheGet(...args),
  set: (...args) => cacheSet(...args),
  drop: vi.fn(),
  reset: vi.fn()
}))

const { rememberUpdate, applyRecentUpdate } = await import('../../../src/update-echo/index.js')

describe('rememberUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheGet.mockResolvedValue(null)
    cacheSet.mockResolvedValue(undefined)
  })

  test('does nothing when the fragment is empty', async () => {
    await rememberUpdate('Business', '107183280', null)

    expect(cacheSet).not.toHaveBeenCalled()
  })

  test('merges onto any existing cached fragment and stores it with the configured TTL', async () => {
    cacheGet.mockResolvedValue({ info: { vat: 'GB123456789' } })

    await rememberUpdate('Business', '107183280', { info: { email: { address: 'new@example.com' } } })

    expect(cacheSet).toHaveBeenCalledWith(
      'Business:107183280',
      { info: { vat: 'GB123456789', email: { address: 'new@example.com' } } },
      15 * 60 * 1000
    )
  })

  test('swallows cache failures rather than throwing', async () => {
    cacheSet.mockRejectedValue(new Error('cache is unavailable'))

    await expect(rememberUpdate('Business', '107183280', { info: { vat: 'GB123456789' } })).resolves.toBeUndefined()
  })

  test('does nothing when the feature flag is disabled', async () => {
    vi.resetModules()
    vi.stubEnv('UPDATE_ECHO_ENABLED', 'false')

    const { rememberUpdate: rememberUpdateDisabled } = await import('../../../src/update-echo/index.js')
    await rememberUpdateDisabled('Business', '107183280', { info: { vat: 'GB123456789' } })

    expect(cacheSet).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('does nothing when sanitization is disabled', async () => {
    vi.resetModules()
    vi.stubEnv('SANITIZE_DATA', 'false')

    const { rememberUpdate: rememberUpdateUnsanitized } = await import('../../../src/update-echo/index.js')
    await rememberUpdateUnsanitized('Business', '107183280', { info: { vat: 'GB123456789' } })

    expect(cacheSet).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})

describe('applyRecentUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheGet.mockResolvedValue(null)
  })

  test('returns the entity unchanged when nothing is cached', async () => {
    const entity = { sbi: '107183280', info: { vat: 'FAKE1' } }

    expect(await applyRecentUpdate('Business', '107183280', entity)).toBe(entity)
  })

  test('returns null entities unchanged without touching the cache', async () => {
    expect(await applyRecentUpdate('Business', '107183280', null)).toBeNull()
    expect(cacheGet).not.toHaveBeenCalled()
  })

  test('overlays a cached fragment onto the entity', async () => {
    cacheGet.mockResolvedValue({ info: { vat: 'GB123456789' } })

    const entity = { sbi: '107183280', info: { vat: 'FAKE1', email: { address: 'fake@example.com' } } }

    expect(await applyRecentUpdate('Business', '107183280', entity)).toEqual({
      sbi: '107183280',
      info: { vat: 'GB123456789', email: { address: 'fake@example.com' } }
    })
  })

  test('swallows cache failures and returns the entity unchanged', async () => {
    cacheGet.mockRejectedValue(new Error('cache is unavailable'))
    const entity = { sbi: '107183280', info: { vat: 'FAKE1' } }

    expect(await applyRecentUpdate('Business', '107183280', entity)).toBe(entity)
  })

  test('does nothing when the feature flag is disabled', async () => {
    vi.resetModules()
    vi.stubEnv('UPDATE_ECHO_ENABLED', 'false')

    const { applyRecentUpdate: applyRecentUpdateDisabled } = await import('../../../src/update-echo/index.js')
    const entity = { sbi: '107183280', info: { vat: 'FAKE1' } }

    expect(await applyRecentUpdateDisabled('Business', '107183280', entity)).toBe(entity)
    expect(cacheGet).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
