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

    const result = await getBusinessCustomer('107183280', '1102634220')

    expect(result).toEqual({
      crn: '1102634220',
      permissionGroups: [{ id: 'BUSINESS_DETAILS', level: 'AMEND' }]
    })
  })

  test('returns null when the DAL has no matching customer for the business', async () => {
    queryDal.mockResolvedValue({ business: { customer: null } })

    expect(await getBusinessCustomer('107183280', '1102634220')).toBeNull()
  })

  test('forwards the caller token to the DAL', async () => {
    queryDal.mockResolvedValue({ business: { customer: { permissionGroups: [] } } })

    await getBusinessCustomer('107183280', '1102634220', { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { sbi: '107183280', crn: '1102634220' },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })
})
