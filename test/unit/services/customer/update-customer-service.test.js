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
      updateCustomerAllFields: { success: true, customer: { crn: '1102634220' } }
    })

    const result = await updateCustomer({ crn: '1102634220', first: 'James' })

    expect(result).toEqual({ success: true, customer: { crn: '1102634220' } })
  })

  test('returns null when the DAL response has no result', async () => {
    queryDal.mockResolvedValue({})

    expect(await updateCustomer({ crn: '1102634220' })).toBeNull()
  })

  test('forwards the input and caller token to the DAL', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: true } })

    const input = { crn: '1102634220', last: 'Henderson' }
    await updateCustomer(input, { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { input },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })

  test('remembers a successful update for the echo cache', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: true } })

    const input = { crn: '1102634220', first: 'James' }
    await updateCustomer(input)

    expect(rememberUpdate).toHaveBeenCalledWith('Customer', '1102634220', { info: { name: { first: 'James' } } })
  })

  test('does not remember an unsuccessful update', async () => {
    queryDal.mockResolvedValue({ updateCustomerAllFields: { success: false } })

    await updateCustomer({ crn: '1102634220', first: 'James' })

    expect(rememberUpdate).not.toHaveBeenCalled()
  })
})
