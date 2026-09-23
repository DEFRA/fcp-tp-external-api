import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const UPDATE_CUSTOMER_MUTATION = `
  mutation UpdateCustomerAllFields($input: UpdateCustomerAllFieldsInput!) {
    updateCustomerAllFields(input: $input) {
      success
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

describe('updateCustomerAllFields mutation', () => {
  test('sends the input straight through to the DAL and returns its response', async () => {
    const fetchMock = mockDal({
      updateCustomerAllFields: { success: true }
    })

    const input = { crn: '1102634220', first: 'James', last: 'Henderson' }
    const response = await graphqlRequest(server, UPDATE_CUSTOMER_MUTATION, { input })
    const { data, errors } = JSON.parse(response.payload)

    expect(response.statusCode).toBe(200)
    expect(errors).toBeUndefined()
    expect(data.updateCustomerAllFields).toEqual({ success: true })

    const [, requestOptions] = fetchMock.mock.calls[0]
    expect(JSON.parse(requestOptions.body).variables).toEqual({ input })
  })

  test('rejects an invalid crn without calling the DAL', async () => {
    const fetchMock = mockDal({ updateCustomerAllFields: { success: true } })

    const response = await graphqlRequest(server, UPDATE_CUSTOMER_MUTATION, { input: { crn: '123' } })
    const { errors } = JSON.parse(response.payload)

    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
