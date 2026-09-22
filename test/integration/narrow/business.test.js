import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { dalResponses, mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'

// The service's own Entra token is an implementation detail of talking to the
// DAL, so integration tests stub it out and assert on the DAL request instead.
vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const BUSINESS_QUERY = `
  query Business($sbi: ID!) {
    business(sbi: $sbi) {
      organisationId
      sbi
      info {
        name
        vat
        traderNumber
        vendorNumber
        legalStatus { code type }
        address { line1 city postalCode uprn }
        email { address }
        phone { mobile landline }
      }
      countyParishHoldings { cphNumber }
    }
  }
`

const PERMISSIONS_QUERY = `
  query Permissions($sbi: ID!, $crn: ID!) {
    business(sbi: $sbi) {
      sbi
      customer(crn: $crn) {
        crn
        permissionGroups { id level }
      }
    }
  }
`

let server

beforeAll(async () => {
  server = await createServer()
  await server.initialize()
})

afterAll(async () => {
  await server.stop({ timeout: 0 })
  await stopApolloServer()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('business query', () => {
  test('returns the business for a valid sbi', async () => {
    mockDal({ business: dalResponses.business })

    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })
    const { data, errors } = JSON.parse(response.payload)

    expect(response.statusCode).toBe(200)
    expect(errors).toBeUndefined()
    expect(data.business.sbi).toBe('107183280')
    expect(data.business.organisationId).toBe('5565448')
    expect(data.business.countyParishHoldings).toEqual([{ cphNumber: '10/123/4567' }])
  })

  test('substitutes business and contact data before returning it', async () => {
    mockDal({ business: dalResponses.business })

    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })
    const { info } = JSON.parse(response.payload).data.business

    expect(info.vat).not.toBe(dalResponses.business.info.vat)
    expect(info.address.postalCode).not.toBe(dalResponses.business.info.address.postalCode)
    expect(info.email.address).not.toBe(dalResponses.business.info.email.address)
    expect(info.phone.mobile).not.toBe(dalResponses.business.info.phone.mobile)
  })

  test('leaves identifiers and business name intact so the data stays joinable', async () => {
    mockDal({ business: dalResponses.business })

    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })
    const { info } = JSON.parse(response.payload).data.business

    expect(info.name).toBe(dalResponses.business.info.name)
    expect(info.traderNumber).toBe(dalResponses.business.info.traderNumber)
    expect(info.vendorNumber).toBe(dalResponses.business.info.vendorNumber)
    expect(info.legalStatus).toEqual(dalResponses.business.info.legalStatus)
  })

  test('sends the query to the DAL with the service token and external gateway header', async () => {
    const fetchMock = mockDal({ business: dalResponses.business })

    await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })

    const [endpoint, options] = fetchMock.mock.calls[0]
    expect(endpoint).toBe('http://localhost:3000/graphql')
    expect(options.headers.Authorization).toBe('Bearer a-service-token')
    expect(options.headers['gateway-type']).toBe('external')
    expect(JSON.parse(options.body).variables).toEqual({ sbi: '107183280' })
  })

  test('forwards the caller authorization header to the DAL', async () => {
    const fetchMock = mockDal({ business: dalResponses.business })

    await graphqlRequest(
      server,
      BUSINESS_QUERY,
      { sbi: '107183280' },
      { 'x-forwarded-authorization': 'Bearer a-caller-token' }
    )

    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers['x-forwarded-authorization']).toBe('Bearer a-caller-token')
  })

  test('rejects an invalid sbi without calling the DAL', async () => {
    const fetchMock = mockDal({ business: dalResponses.business })

    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: 'not-an-sbi' })
    const { errors } = JSON.parse(response.payload)

    expect(errors[0].message).toBe('sbi is not valid')
    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns null when the DAL has no matching business', async () => {
    mockDal({ business: null })

    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })

    expect(JSON.parse(response.payload).data.business).toBeNull()
  })

  test('reports a DAL failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))

    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })
    const { errors } = JSON.parse(response.payload)

    expect(errors[0].extensions.code).toBe('DAL_UNAVAILABLE')
  })
})

describe('permissions query', () => {
  test('returns the permission groups a customer holds for a business', async () => {
    mockDal({
      business: {
        sbi: '107183280',
        customer: { crn: '1102634220', permissionGroups: dalResponses.permissionGroups }
      }
    })

    const response = await graphqlRequest(server, PERMISSIONS_QUERY, {
      sbi: '107183280',
      crn: '1102634220'
    })
    const { customer } = JSON.parse(response.payload).data.business

    expect(customer.crn).toBe('1102634220')
    expect(customer.permissionGroups).toEqual(dalResponses.permissionGroups)
  })

  test('rejects an invalid crn', async () => {
    mockDal({ business: dalResponses.business })

    const response = await graphqlRequest(server, PERMISSIONS_QUERY, {
      sbi: '107183280',
      crn: '123'
    })

    expect(JSON.parse(response.payload).errors[0].message).toBe('crn is not valid')
  })
})
