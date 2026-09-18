import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { dalResponses, mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const CUSTOMER_QUERY = `
  query Customer($crn: ID!) {
    customer(crn: $crn) {
      crn
      info {
        name { first middle last }
        dateOfBirth
        email { address }
        phone { mobile landline }
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

describe('customer query', () => {
  test('returns the customer for a valid crn', async () => {
    mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: '1102634220' })
    const { data, errors } = JSON.parse(response.payload)

    expect(response.statusCode).toBe(200)
    expect(errors).toBeUndefined()
    expect(data.customer.crn).toBe('1102634220')
  })

  test('substitutes personal data before returning it', async () => {
    mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: '1102634220' })
    const { info } = JSON.parse(response.payload).data.customer

    expect(info.name.first).not.toBe(dalResponses.customer.info.name.first)
    expect(info.name.last).not.toBe(dalResponses.customer.info.name.last)
    expect(info.dateOfBirth).not.toBe(dalResponses.customer.info.dateOfBirth)
    expect(info.email.address).not.toBe(dalResponses.customer.info.email.address)
  })

  test('substitutes a value the same way every time it is requested', async () => {
    mockDal({ customer: dalResponses.customer })
    const first = await graphqlRequest(server, CUSTOMER_QUERY, { crn: '1102634220' })

    mockDal({ customer: dalResponses.customer })
    const second = await graphqlRequest(server, CUSTOMER_QUERY, { crn: '1102634220' })

    expect(JSON.parse(first.payload)).toEqual(JSON.parse(second.payload))
  })

  test('rejects an invalid crn without calling the DAL', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: '123' })
    const { errors } = JSON.parse(response.payload)

    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns null when the DAL has no matching customer', async () => {
    mockDal({ customer: null })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: '1102634220' })

    expect(JSON.parse(response.payload).data.customer).toBeNull()
  })
})
