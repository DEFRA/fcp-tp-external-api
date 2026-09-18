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

  test('maps county parish holdings', () => {
    const result = mapBusiness({
      sbi: '107183280',
      countyParishHoldings: [{ cphNumber: '10/123/4567' }]
    })

    expect(result.countyParishHoldings).toEqual([{ cphNumber: '10/123/4567' }])
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

  test('maps the customer name', () => {
    const result = mapCustomer({
      crn: '1102634220',
      info: { name: { first: 'James', last: 'Henderson' } }
    })

    expect(result.info.name).toEqual({ first: 'James', middle: null, last: 'Henderson' })
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

  test('does not sanitize permission groups', () => {
    mapPermissionGroups([{ id: 'BUSINESS_DETAILS', level: 'AMEND' }])

    expect(sanitize).not.toHaveBeenCalled()
  })
})
