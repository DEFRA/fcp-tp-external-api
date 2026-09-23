import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { dalResponses, mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const UPDATE_BUSINESS_MUTATION = `
  mutation UpdateBusinessAllFields($input: UpdateBusinessAllFieldsInput!) {
    updateBusinessAllFields(input: $input) {
      success
      business {
        sbi
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

describe('updateBusinessAllFields mutation', () => {
  test('sends the input straight through to the DAL and returns its response', async () => {
    const fetchMock = mockDal({
      updateBusinessAllFields: { success: true, business: { sbi: dalResponses.business.sbi } }
    })

    const input = { sbi: '107183280', name: 'Henderson Family Farms', vat: '123456789' }
    const response = await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input })
    const { data, errors } = JSON.parse(response.payload)

    expect(response.statusCode).toBe(200)
    expect(errors).toBeUndefined()
    expect(data.updateBusinessAllFields).toEqual({ success: true, business: { sbi: '107183280' } })

    const [, requestOptions] = fetchMock.mock.calls[0]
    expect(JSON.parse(requestOptions.body).variables).toEqual({ input })
  })

  test('rejects an invalid sbi without calling the DAL', async () => {
    const fetchMock = mockDal({ updateBusinessAllFields: { success: true } })

    const response = await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input: { sbi: '123' } })
    const { errors } = JSON.parse(response.payload)

    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
