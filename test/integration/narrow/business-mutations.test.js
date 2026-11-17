import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const UPDATE_BUSINESS_MUTATION = `
  mutation UpdateBusinessAllFields($input: UpdateBusinessAllFieldsInput!) {
    updateBusinessAllFields(input: $input) {
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

describe('updateBusinessAllFields mutation', () => {
  test('sends the input straight through to the DAL and returns its response', async () => {
    const fetchMock = mockDal({
      updateBusinessAllFields: { success: true }
    })

    const input = { sbi: '123456789', name: 'Henderson Family Farms', vat: '987654321' }
    const response = await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input })
    const { data, errors } = JSON.parse(response.payload)

    expect(response.statusCode).toBe(200)
    expect(errors).toBeUndefined()
    expect(data.updateBusinessAllFields).toEqual({ success: true })

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

  test('sends a manual address to the DAL as withoutUprn', async () => {
    const fetchMock = mockDal({ updateBusinessAllFields: { success: true } })

    const address = { line1: '1 New Street', city: 'Leeds', county: 'West Yorkshire', postalCode: 'LS1 1AA', country: 'UK' }
    await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input: { sbi: '123456789', address } })

    const [, requestOptions] = fetchMock.mock.calls[0]
    const { input } = JSON.parse(requestOptions.body).variables
    expect(input.address).toEqual({
      withoutUprn: expect.objectContaining({ line1: '1 New Street', line4: 'West Yorkshire', county: null, uprn: null })
    })
  })

  test('sends an address with a UPRN to the DAL as withUprn', async () => {
    const fetchMock = mockDal({ updateBusinessAllFields: { success: true } })

    const address = { line1: '1 New Street', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK', uprn: '100012345678' }
    await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input: { sbi: '123456789', address } })

    const [, requestOptions] = fetchMock.mock.calls[0]
    const { input } = JSON.parse(requestOptions.body).variables
    expect(input.address).toEqual({
      withUprn: expect.objectContaining({ buildingName: '1 New Street', line1: null, uprn: '100012345678' })
    })
  })

  test('rejects a blank required address field without calling the DAL', async () => {
    const fetchMock = mockDal({ updateBusinessAllFields: { success: true } })

    const address = { line1: ' ', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK' }
    const response = await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input: { sbi: '123456789', address } })
    const { errors } = JSON.parse(response.payload)

    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(errors[0].extensions.argumentName).toBe('address.line1')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
