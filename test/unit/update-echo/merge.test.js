import { describe, test, expect } from 'vitest'
import { mergeFragment } from '../../../src/update-echo/merge.js'

describe('mergeFragment', () => {
  test('returns the entity unchanged when there is no fragment', () => {
    const entity = { sbi: '107183280', info: { vat: 'GB123456789' } }

    expect(mergeFragment(entity, null)).toBe(entity)
    expect(mergeFragment(entity, {})).toBe(entity)
  })

  test('returns the entity unchanged when it is null', () => {
    expect(mergeFragment(null, { info: { vat: 'GB123456789' } })).toBeNull()
  })

  test('overlays only the keys present in the fragment', () => {
    const entity = { sbi: '107183280', info: { vat: 'FAKE1', email: { address: 'fake@example.com' } } }
    const fragment = { info: { vat: 'GB123456789' } }

    expect(mergeFragment(entity, fragment)).toEqual({
      sbi: '107183280',
      info: { vat: 'GB123456789', email: { address: 'fake@example.com' } }
    })
  })

  test('creates missing intermediate objects', () => {
    const entity = { sbi: '107183280', info: null }
    const fragment = { info: { vat: 'GB123456789' } }

    expect(mergeFragment(entity, fragment)).toEqual({
      sbi: '107183280',
      info: { vat: 'GB123456789' }
    })
  })

  test('an explicit null in the fragment clears the field', () => {
    const entity = { info: { email: { address: 'fake@example.com' } } }
    const fragment = { info: { email: null } }

    expect(mergeFragment(entity, fragment)).toEqual({ info: { email: null } })
  })

  test('accumulates across successive merges', () => {
    const entity = { info: { vat: 'FAKE1', address: { city: 'Fakeville' } } }
    const first = mergeFragment(entity, { info: { vat: 'GB123456789' } })
    const second = mergeFragment(first, { info: { address: { city: 'Leeds' } } })

    expect(second).toEqual({ info: { vat: 'GB123456789', address: { city: 'Leeds' } } })
  })
})
