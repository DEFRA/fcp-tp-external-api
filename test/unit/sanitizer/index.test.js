import { describe, test, expect } from 'vitest'
import { sanitizeWith } from '../../../src/sanitizer/index.js'

const SECRET = 'test-secret'

const BUSINESS = {
  organisationId: '5565448',
  sbi: '107183280',
  info: {
    name: 'Henderson Family Farms',
    vat: 'GB123456789',
    traderNumber: '010203040506',
    vendorNumber: '694523',
    legalStatus: { code: '102111', type: 'Sole Proprietorship' },
    type: { code: '101443', type: 'Central Government' },
    address: {
      pafOrganisationName: 'FORTESCUE ESTATE',
      buildingNumberRange: '14',
      buildingName: 'Oakwood House',
      flatName: 'Flat 3',
      street: 'Oakwood Drive',
      city: 'Sheffield',
      county: 'South Yorkshire',
      postalCode: 'S10 2GH',
      country: 'United Kingdom',
      dependentLocality: 'Westbury Park',
      doubleDependentLocality: 'Lower District',
      line1: '14 Oakwood Drive',
      line2: 'Westbury Park',
      line3: 'Sheffield',
      line4: 'South Yorkshire',
      line5: 'S10 2GH',
      uprn: '100021432873'
    },
    email: { address: 'james.henderson@mailbox.co.uk' },
    phone: { mobile: '07771234567', landline: '01144960123' }
  },
  countyParishHoldings: [{ cphNumber: '10/123/4567' }]
}

const CUSTOMER = {
  crn: '1102634220',
  info: {
    name: { first: 'James', middle: 'Alan', last: 'Henderson' },
    dateOfBirth: '1972-04-17',
    address: { ...BUSINESS.info.address },
    email: { address: 'james.henderson@mailbox.co.uk' },
    phone: { mobile: '07771234567', landline: '01144960123' }
  }
}

describe('sanitizeWith', () => {
  test('replaces every business data field', () => {
    const result = sanitizeWith(BUSINESS, 'Business', SECRET)

    expect(result.info.name).not.toBe(BUSINESS.info.name)
    expect(result.info.vat).not.toBe(BUSINESS.info.vat)
    expect(result.info.email.address).not.toBe(BUSINESS.info.email.address)
    expect(result.info.phone.mobile).not.toBe(BUSINESS.info.phone.mobile)
    expect(result.info.phone.landline).not.toBe(BUSINESS.info.phone.landline)

    for (const field of Object.keys(BUSINESS.info.address)) {
      expect(result.info.address[field]).not.toBe(BUSINESS.info.address[field])
    }
  })

  test('replaces every personal data field', () => {
    const result = sanitizeWith(CUSTOMER, 'Customer', SECRET)

    expect(result.info.name.first).not.toBe(CUSTOMER.info.name.first)
    expect(result.info.name.middle).not.toBe(CUSTOMER.info.name.middle)
    expect(result.info.name.last).not.toBe(CUSTOMER.info.name.last)
    expect(result.info.dateOfBirth).not.toBe(CUSTOMER.info.dateOfBirth)
    expect(result.info.email.address).not.toBe(CUSTOMER.info.email.address)
  })

  test('preserves identifiers and reference data', () => {
    const result = sanitizeWith(BUSINESS, 'Business', SECRET)

    expect(result.sbi).toBe(BUSINESS.sbi)
    expect(result.organisationId).toBe(BUSINESS.organisationId)
    expect(result.info.traderNumber).toBe(BUSINESS.info.traderNumber)
    expect(result.info.vendorNumber).toBe(BUSINESS.info.vendorNumber)
    expect(result.info.legalStatus).toEqual(BUSINESS.info.legalStatus)
    expect(result.info.type).toEqual(BUSINESS.info.type)
    expect(result.countyParishHoldings).toEqual(BUSINESS.countyParishHoldings)
  })

  test('preserves the customer reference number', () => {
    const result = sanitizeWith(CUSTOMER, 'Customer', SECRET)

    expect(result.crn).toBe(CUSTOMER.crn)
  })

  test('is deterministic for the same input and secret', () => {
    expect(sanitizeWith(BUSINESS, 'Business', SECRET)).toEqual(
      sanitizeWith(BUSINESS, 'Business', SECRET)
    )
  })

  test('substitutes a shared value consistently across entities', () => {
    const business = sanitizeWith(BUSINESS, 'Business', SECRET)
    const customer = sanitizeWith(CUSTOMER, 'Customer', SECRET)

    expect(customer.info.address).toEqual(business.info.address)
    expect(customer.info.email.address).toBe(business.info.email.address)
  })

  test('produces different output for a different secret', () => {
    const a = sanitizeWith(BUSINESS, 'Business', 'secret-a')
    const b = sanitizeWith(BUSINESS, 'Business', 'secret-b')

    expect(a.info.name).not.toBe(b.info.name)
  })

  test('gives the same value in two fields different substitutions', () => {
    const result = sanitizeWith(BUSINESS, 'Business', SECRET)

    expect(result.info.address.line5).not.toBe(result.info.address.postalCode)
  })

  test('preserves null and undefined values', () => {
    const result = sanitizeWith(
      { crn: '1102634220', info: { name: { first: 'James', middle: null, last: 'Henderson' }, address: null, email: null, phone: null } },
      'Customer',
      SECRET
    )

    expect(result.info.name.middle).toBeNull()
    expect(result.info.address).toBeNull()
    expect(result.info.email).toBeNull()
  })

  test('does not mutate the input', () => {
    const original = structuredClone(BUSINESS)
    sanitizeWith(BUSINESS, 'Business', SECRET)

    expect(BUSINESS).toEqual(original)
  })

  test('leaves unknown types untouched', () => {
    const node = { some: 'value' }

    expect(sanitizeWith(node, 'NotAType', SECRET)).toEqual(node)
  })

  test('passes through null and undefined nodes without recursing', () => {
    expect(sanitizeWith(null, 'Business', SECRET)).toBeNull()
    expect(sanitizeWith(undefined, 'Business', SECRET)).toBeUndefined()
  })

  test('sanitizes every item when given an array of nodes', () => {
    const result = sanitizeWith([BUSINESS, BUSINESS], 'Business', SECRET)

    expect(result).toHaveLength(2)
    expect(result[0].info.name).not.toBe(BUSINESS.info.name)
    expect(result[1].info.name).toBe(result[0].info.name)
  })

  test('throws when no secret is configured', () => {
    expect(() => sanitizeWith(BUSINESS, 'Business', null)).toThrow(/SANITIZE_SECRET/)
  })

  test('generates plausible replacement formats', () => {
    const result = sanitizeWith(CUSTOMER, 'Customer', SECRET)

    expect(result.info.email.address).toMatch(/^[a-z]+\.[a-z]+@[a-z.]+$/)
    expect(result.info.address.postalCode).toMatch(/^[A-Z]{2}\d+ \d[A-Z]{2}$/)
    expect(result.info.phone.mobile).toMatch(/^07\d{9}$/)
    expect(result.info.phone.landline).toMatch(/^01\d{9}$/)
    expect(result.info.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.info.address.uprn).toMatch(/^\d{12}$/)
  })
})
