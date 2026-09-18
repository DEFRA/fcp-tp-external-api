import { vi } from 'vitest'

export const dalResponses = {
  business: {
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
  },
  customer: {
    crn: '1102634220',
    info: {
      name: { first: 'James', middle: 'Alan', last: 'Henderson' },
      dateOfBirth: '1972-04-17',
      address: null,
      email: { address: 'james.henderson@mailbox.co.uk' },
      phone: { mobile: '07771234567', landline: '01144960123' }
    }
  },
  permissionGroups: [
    { id: 'BUSINESS_DETAILS', level: 'AMEND' },
    { id: 'LAND_DETAILS', level: 'VIEW' }
  ]
}

export function mockDal (data) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data })
  })

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

export function graphqlRequest (server, query, variables = {}, headers = {}) {
  return server.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json', ...headers },
    payload: { query, variables }
  })
}
