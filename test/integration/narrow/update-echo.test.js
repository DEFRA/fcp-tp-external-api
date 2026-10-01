import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { dalResponses, mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'
import { reset as resetUpdateEchoCache } from '../../../src/common/helpers/caching/update-echo-cache.js'

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const BUSINESS_QUERY = `
  query Business($sbi: ID!) {
    business(sbi: $sbi) {
      sbi
      info {
        name
        vat
        email { address }
      }
    }
  }
`

const UPDATE_BUSINESS_MUTATION = `
  mutation UpdateBusinessAllFields($input: UpdateBusinessAllFieldsInput!) {
    updateBusinessAllFields(input: $input) {
      success
    }
  }
`

const CUSTOMER_QUERY = `
  query Customer($crn: ID!) {
    customer(crn: $crn) {
      crn
      info {
        name { first middle last }
        email { address }
      }
    }
  }
`

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

beforeEach(() => {
  resetUpdateEchoCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('echoing a recent update back past the sanitizer', () => {
  test('a business query returns the value just submitted by an update, not a freshly sanitized one', async () => {
    mockDal({ updateBusinessAllFields: { success: true } })
    const input = { sbi: '107183280', vat: '999999999' }
    await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input })

    mockDal({ business: dalResponses.business })
    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })
    const { info, sbi } = JSON.parse(response.payload).data.business

    expect(sbi).toBe('107183280')
    expect(info.vat).toBe('999999999')
  })

  test('fields not touched by the update are still sanitized', async () => {
    mockDal({ updateBusinessAllFields: { success: true } })
    await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input: { sbi: '107183280', vat: '999999999' } })

    mockDal({ business: dalResponses.business })
    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })
    const { info } = JSON.parse(response.payload).data.business

    expect(info.email.address).not.toBe(dalResponses.business.info.email.address)
  })

  test('an unsuccessful update is not echoed', async () => {
    mockDal({ updateBusinessAllFields: { success: false } })
    await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input: { sbi: '107183280', vat: '999999999' } })

    mockDal({ business: dalResponses.business })
    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: '107183280' })
    const { info } = JSON.parse(response.payload).data.business

    expect(info.vat).not.toBe('999999999')
  })

  test('a customer query returns the value just submitted by an update', async () => {
    mockDal({ updateCustomerAllFields: { success: true } })
    const input = { crn: '1102634220', first: 'Jamie' }
    await graphqlRequest(server, UPDATE_CUSTOMER_MUTATION, { input })

    mockDal({ customer: dalResponses.customer })
    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: '1102634220' })
    const { info } = JSON.parse(response.payload).data.customer

    expect(info.name.first).toBe('Jamie')
    expect(info.name.last).not.toBe(dalResponses.customer.info.name.last)
  })

  test('does not echo when UPDATE_ECHO_ENABLED is false', async () => {
    vi.resetModules()
    vi.stubEnv('UPDATE_ECHO_ENABLED', 'false')
    const { createServer: createServerWithEchoDisabled } = await import('../../../src/server.js')
    const disabledServer = await createServerWithEchoDisabled()
    await disabledServer.initialize()

    mockDal({ updateBusinessAllFields: { success: true } })
    await graphqlRequest(disabledServer, UPDATE_BUSINESS_MUTATION, { input: { sbi: '107183280', vat: '999999999' } })

    mockDal({ business: dalResponses.business })
    const response = await graphqlRequest(disabledServer, BUSINESS_QUERY, { sbi: '107183280' })
    const { info } = JSON.parse(response.payload).data.business

    expect(info.vat).not.toBe('999999999')

    await disabledServer.stop({ timeout: 0 })
    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
