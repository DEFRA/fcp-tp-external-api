import { describe, test, expect, vi, beforeEach } from 'vitest'

const sanitize = vi.fn((node) => node)

vi.mock('../../../src/sanitizer/index.js', () => ({
  sanitize: (...args) => sanitize(...args)
}))

const { mapBusiness, mapCustomer, mapPermissionGroups } = await import('../../../src/mappers/index.js')

describe('mapBusiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns null when the DAL has no business', () => {
    expect(mapBusiness(null)).toBeNull()
  })

  test('fills absent fields with null rather than omitting them', () => {
    const result = mapBusiness({ sbi: '107183280', info: { name: 'A Farm' } })

    expect(result.organisationId).toBeNull()
    expect(result.info.vat).toBeNull()
    expect(result.info.address).toBeNull()
    expect(result.info.email).toBeNull()
    expect(result.info.phone).toBeNull()
    expect(result.countyParishHoldings).toEqual([])
  })

  test('fills absent nested fields with null when the parent object is present', () => {
    const result = mapBusiness({
      sbi: '107183280',
      info: { legalStatus: {}, type: {}, email: {}, phone: {} }
    })

    expect(result.info.name).toBeNull()
    expect(result.info.legalStatus).toEqual({ code: null, type: null })
    expect(result.info.type).toEqual({ code: null, type: null })
    expect(result.info.email).toEqual({ address: null })
    expect(result.info.phone).toEqual({ mobile: null, landline: null })
  })

  test('maps county parish holdings', () => {
    const result = mapBusiness({
      sbi: '107183280',
      countyParishHoldings: [{ cphNumber: '10/123/4567' }]
    })

    expect(result.countyParishHoldings).toEqual([{ cphNumber: '10/123/4567' }])
  })

  test('fills a missing cph number with null', () => {
    const result = mapBusiness({ sbi: '107183280', countyParishHoldings: [{}] })

    expect(result.countyParishHoldings).toEqual([{ cphNumber: null }])
  })

  test('maps a fully populated business', () => {
    const result = mapBusiness({
      organisationId: '5565448',
      sbi: '107183280',
      info: {
        name: 'Henderson Family Farms',
        vat: 'GB123456789',
        traderNumber: '010203040506',
        vendorNumber: '694523',
        legalStatus: { code: '102111', type: 'Sole Proprietorship' },
        type: { code: '101443', type: 'Central Government' },
        address: { line1: '14 Oakwood Drive', postalCode: 'S10 2GH' },
        email: { address: 'james.henderson@mailbox.co.uk' },
        phone: { mobile: '07771234567', landline: '01144960123' }
      }
    })

    expect(result.info.legalStatus).toEqual({ code: '102111', type: 'Sole Proprietorship' })
    expect(result.info.type).toEqual({ code: '101443', type: 'Central Government' })
    expect(result.info.address).toMatchObject({ line1: '14 Oakwood Drive', postalCode: 'S10 2GH', line2: null })
    expect(result.info.email).toEqual({ address: 'james.henderson@mailbox.co.uk' })
    expect(result.info.phone).toEqual({ mobile: '07771234567', landline: '01144960123' })
  })

  test('passes the mapped business through the sanitizer', () => {
    mapBusiness({ sbi: '107183280' })

    expect(sanitize).toHaveBeenCalledWith(expect.objectContaining({ sbi: '107183280' }), 'Business')
  })
})

describe('mapCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns null when the DAL has no customer', () => {
    expect(mapCustomer(null)).toBeNull()
  })

  test('fills absent info with null', () => {
    expect(mapCustomer({ crn: '1102634220' }).info).toBeNull()
  })

  test('fills absent name with null', () => {
    const result = mapCustomer({ crn: '1102634220', info: { dateOfBirth: '1972-04-17' } })

    expect(result.info.name).toBeNull()
  })

  test('fills absent name parts with null', () => {
    const result = mapCustomer({ crn: '1102634220', info: { name: { middle: 'Alan' } } })

    expect(result.info.name).toEqual({ first: null, middle: 'Alan', last: null })
  })

  test('maps the customer name', () => {
    const result = mapCustomer({
      crn: '1102634220',
      info: { name: { first: 'James', last: 'Henderson' } }
    })

    expect(result.info.name).toEqual({ first: 'James', middle: null, last: 'Henderson' })
  })

  test('maps a fully populated customer', () => {
    const result = mapCustomer({
      crn: '1102634220',
      info: {
        name: { first: 'James', middle: 'Alan', last: 'Henderson' },
        dateOfBirth: '1972-04-17',
        address: { line1: '14 Oakwood Drive', postalCode: 'S10 2GH' },
        email: { address: 'james.henderson@mailbox.co.uk' },
        phone: { mobile: '07771234567', landline: '01144960123' }
      }
    })

    expect(result.info.dateOfBirth).toBe('1972-04-17')
    expect(result.info.address).toMatchObject({ line1: '14 Oakwood Drive', postalCode: 'S10 2GH' })
    expect(result.info.email).toEqual({ address: 'james.henderson@mailbox.co.uk' })
    expect(result.info.phone).toEqual({ mobile: '07771234567', landline: '01144960123' })
  })

  test('passes the mapped customer through the sanitizer', () => {
    mapCustomer({ crn: '1102634220' })

    expect(sanitize).toHaveBeenCalledWith(expect.objectContaining({ crn: '1102634220' }), 'Customer')
  })
})

describe('mapPermissionGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns an empty list when there are no groups', () => {
    expect(mapPermissionGroups(null)).toEqual([])
  })

  test('maps id and level', () => {
    expect(mapPermissionGroups([{ id: 'BUSINESS_DETAILS', level: 'AMEND' }])).toEqual([
      { id: 'BUSINESS_DETAILS', level: 'AMEND' }
    ])
  })

  test('fills a missing id or level with null', () => {
    expect(mapPermissionGroups([{}])).toEqual([{ id: null, level: null }])
  })

  test('does not sanitize permission groups', () => {
    mapPermissionGroups([{ id: 'BUSINESS_DETAILS', level: 'AMEND' }])

    expect(sanitize).not.toHaveBeenCalled()
  })
})
