import { describe, test, expect, vi, beforeEach } from 'vitest'

const queryDal = vi.fn()

vi.mock('../../../../src/dal/connector.js', () => ({
  queryDal: (...args) => queryDal(...args)
}))

const { getBusinessCustomer } = await import('../../../../src/services/permissions/get-business-customer-service.js')

describe('getBusinessCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns the crn and mapped permission groups', async () => {
    queryDal.mockResolvedValue({
      business: {
        customer: {
          permissionGroups: [{ id: 'BUSINESS_DETAILS', level: 'AMEND' }]
        }
      }
    })

    const result = await getBusinessCustomer('123456789', '1234567890')

    expect(result).toEqual({
      crn: '1234567890',
      permissionGroups: [{ id: 'BUSINESS_DETAILS', level: 'AMEND' }]
    })
  })

  test('returns null when the DAL has no matching customer for the business', async () => {
    queryDal.mockResolvedValue({ business: { customer: null } })

    expect(await getBusinessCustomer('123456789', '1234567890')).toBeNull()
  })

  test('forwards the caller token to the DAL', async () => {
    queryDal.mockResolvedValue({ business: { customer: { permissionGroups: [] } } })

    await getBusinessCustomer('123456789', '1234567890', { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { sbi: '123456789', crn: '1234567890' },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })
})
