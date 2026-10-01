import { describe, test, expect, beforeEach } from 'vitest'
import * as updateEchoCache from '../../../../../src/common/helpers/caching/update-echo-cache.js'

function wait (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('update-echo-cache', () => {
  beforeEach(() => {
    updateEchoCache.reset()
  })

  test('returns null for a key that was never set', async () => {
    expect(await updateEchoCache.get('Business:107183280')).toBeNull()
  })

  test('returns what was set', async () => {
    await updateEchoCache.set('Business:107183280', { info: { vat: 'GB123456789' } }, 60000)

    expect(await updateEchoCache.get('Business:107183280')).toEqual({ info: { vat: 'GB123456789' } })
  })

  test('drop removes a cached value', async () => {
    await updateEchoCache.set('Business:107183280', { info: { vat: 'GB123456789' } }, 60000)
    await updateEchoCache.drop('Business:107183280')

    expect(await updateEchoCache.get('Business:107183280')).toBeNull()
  })

  test('a value is gone once its TTL expires', async () => {
    await updateEchoCache.set('Business:107183280', { info: { vat: 'GB123456789' } }, 10)
    await wait(50)

    expect(await updateEchoCache.get('Business:107183280')).toBeNull()
  })
})
