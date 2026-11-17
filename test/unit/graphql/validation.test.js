import { describe, test, expect } from 'vitest'
import { assertValidSbi, assertValidCrn, assertValidAddress } from '../../../src/graphql/validation.js'

describe('assertValidSbi', () => {
  test('accepts a nine digit identifier', () => {
    expect(() => assertValidSbi('123456789')).not.toThrow()
  })

  test.each(['0123456789', '12345678', '1234567890', 'not-an-sbi', '012345678'])(
    'rejects %s',
    (sbi) => {
      expect(() => assertValidSbi(sbi)).toThrow('sbi is not valid')
    }
  )
})

describe('assertValidCrn', () => {
  test('accepts a ten digit reference number', () => {
    expect(() => assertValidCrn('1234567890')).not.toThrow()
  })

  test.each(['123456789', '12345678901', '0123456789', 'not-a-crn'])(
    'rejects %s',
    (crn) => {
      expect(() => assertValidCrn(crn)).toThrow('crn is not valid')
    }
  )
})

describe('assertValidAddress', () => {
  const address = { line1: '1 New Street', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK' }

  test('accepts an address with every required field', () => {
    expect(() => assertValidAddress(address, 'address')).not.toThrow()
  })

  test('accepts a missing address', () => {
    expect(() => assertValidAddress(null, 'address')).not.toThrow()
    expect(() => assertValidAddress(undefined, 'address')).not.toThrow()
  })

  test.each(['line1', 'city', 'postalCode', 'country'])(
    'rejects a blank %s',
    (field) => {
      expect(() => assertValidAddress({ ...address, [field]: '  ' }, 'address')).toThrow(`address.${field} must not be blank`)
    }
  )
})
