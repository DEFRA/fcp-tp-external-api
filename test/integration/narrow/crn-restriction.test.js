import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { dalResponses, mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'
import { config } from '../../../src/config.js'

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('******')
}))

const ALLOWED_CRN = '1102634220'
const OTHER_CRN = '1111111902'

const CUSTOMER_QUERY = `
  query Customer($crn: ID!) {
    customer(crn: $crn) {
      crn
      info { name { first } }
    }
  }
`

const UPDATE_CUSTOMER_MUTATION = `
  mutation Update($input: UpdateCustomerAllFieldsInput!) {
    updateCustomerAllFields(input: $input) { success }
  }
`

function defraIdToken (crn) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256' })}.${encode({ contactId: crn })}.signature`
}

function asUser (crn) {
  return { 'x-forwarded-authorization': defraIdToken(crn) }
}

let server

beforeAll(async () => {
  server = await createServer()
  await server.initialize()
})

afterAll(async () => {
  await server.stop({ timeout: 0 })
  await stopApolloServer()
})

beforeEach(() => {
  config.set('crnRestriction.isEnabled', true)
  config.set('crnRestriction.allowedCrns', [ALLOWED_CRN])
})

afterEach(() => {
  config.set('crnRestriction.isEnabled', false)
  config.set('crnRestriction.allowedCrns', [])
  vi.unstubAllGlobals()
})

describe('CRN restriction', () => {
  test('lets a query through for an allowed CRN', async () => {
    mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: ALLOWED_CRN }, asUser(ALLOWED_CRN))

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload).data.customer.crn).toBe('1102634220')
  })

  test('refuses a query from a CRN that is not allowed, without calling the DAL', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: ALLOWED_CRN }, asUser(OTHER_CRN))
    const { errors, data } = JSON.parse(response.payload)

    expect(response.statusCode).toBe(403)
    expect(data).toBeUndefined()
    expect(errors[0].extensions.code).toBe('FORBIDDEN')
    expect(errors[0].message).toMatch(/does not have permission/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('refuses a mutation from a CRN that is not allowed, without calling the DAL', async () => {
    const fetchMock = mockDal({ updateCustomerAllFields: { success: true } })

    const response = await graphqlRequest(
      server,
      UPDATE_CUSTOMER_MUTATION,
      { input: { crn: ALLOWED_CRN, first: 'Alice' } },
      asUser(OTHER_CRN)
    )

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('refuses a request with no token', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: ALLOWED_CRN })

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('refuses everything when the allow-list is empty', async () => {
    config.set('crnRestriction.allowedCrns', [])
    mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: ALLOWED_CRN }, asUser(ALLOWED_CRN))

    expect(response.statusCode).toBe(403)
  })

  test('permits any CRN when restriction is turned off', async () => {
    config.set('crnRestriction.isEnabled', false)
    mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: ALLOWED_CRN }, asUser(OTHER_CRN))

    expect(response.statusCode).toBe(200)
  })

  test('still forwards the allowed user token to the DAL unchanged', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })
    const headers = asUser(ALLOWED_CRN)

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: ALLOWED_CRN }, headers)

    expect(fetchMock.mock.calls[0][1].headers['x-forwarded-authorization']).toBe(headers['x-forwarded-authorization'])
  })

  test('leaves the health check open', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
  })
})
