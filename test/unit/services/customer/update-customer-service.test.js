import { describe, test, expect, vi, beforeEach } from 'vitest'

const queryDal = vi.fn()
const rememberUpdate = vi.fn()

vi.mock('../../../../src/dal/connector.js', () => ({
  queryDal: (...args) => queryDal(...args)
}))

vi.mock('../../../../src/update-echo/index.js', () => ({
  rememberUpdate: (...args) => rememberUpdate(...args)
}))

const { updateCustomer } = await import('../../../../src/services/customer/update-customer-service.js')

describe('updateCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rememberUpdate.mockResolvedValue(undefined)
  })

  test('returns the DAL mutation result', async () => {
    queryDal.mockResolvedValue({
      updateCustomerAllFields: { success: true, customer: { crn: '1234567890' } }
    })

    const result = await updateCustomer({ crn: '1234567890', first: 'James' })

    expect(result).toEqual({ success: true, customer: { crn: '1234567890' } })
  })

  test('returns null when the DAL response has no result', async () => {
    queryDal.mockResolvedValue({})

    expect(await updateCustomer({ crn: '1234567890' })).toBeNull()
  })

  test('forwards the input and caller token to the DAL', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: true } })

    const input = { crn: '1234567890', last: 'Henderson' }
    await updateCustomer(input, { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { input },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })

  test('remembers a successful update for the echo cache', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: true } })

    const input = { crn: '1234567890', first: 'James' }
    await updateCustomer(input)

    expect(rememberUpdate).toHaveBeenCalledWith('Customer', '1234567890', { info: { name: { first: 'James' } } })
  })

  test('sends the address to the DAL in its own shape', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: true } })

    const address = { line1: '1 New Street', city: 'Leeds', county: 'West Yorkshire', postalCode: 'LS1 1AA', country: 'UK' }
    await updateCustomer({ crn: '1234567890', address })

    const [, { input }] = queryDal.mock.calls[0]
    expect(input.address).toMatchObject({ line1: '1 New Street', line4: 'West Yorkshire', county: null, uprn: null })
  })

  test('passes an explicit null address through', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: true } })

    await updateCustomer({ crn: '1234567890', address: null })

    const [, { input }] = queryDal.mock.calls[0]
    expect(input.address).toBeNull()
  })

  test('does not remember an unsuccessful update', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: false } })

    await updateCustomer({ crn: '1234567890', first: 'James' })

    expect(rememberUpdate).not.toHaveBeenCalled()
  })
})
