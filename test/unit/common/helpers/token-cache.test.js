import { describe, test, expect } from 'vitest'
import { get, set, drop } from '../../../../src/common/helpers/caching/token-cache.js'

describe('token cache', () => {
  test('returns null when nothing is cached', async () => {
    expect(await get('not-cached')).toBeNull()
  })

  test('returns a stored value', async () => {
    await set('a-key', 'Bearer a-token', 60000)

    expect(await get('a-key')).toBe('Bearer a-token')
  })

  test('forgets a dropped value', async () => {
    await set('a-dropped-key', 'Bearer a-token', 60000)
    await drop('a-dropped-key')

    expect(await get('a-dropped-key')).toBeNull()
  })

  test('forgets an expired value', async () => {
    await set('an-expiring-key', 'Bearer a-token', 1)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(await get('an-expiring-key')).toBeNull()
  })
})
