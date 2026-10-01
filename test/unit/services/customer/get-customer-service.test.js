import { describe, test, expect, vi, beforeEach } from 'vitest'

const queryDal = vi.fn()
const applyRecentUpdate = vi.fn()

vi.mock('../../../../src/dal/connector.js', () => ({
  queryDal: (...args) => queryDal(...args)
}))

vi.mock('../../../../src/update-echo/index.js', () => ({
  applyRecentUpdate: (...args) => applyRecentUpdate(...args)
}))

const { getCustomer } = await import('../../../../src/services/customer/get-customer-service.js')

describe('getCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('overlays any recently echoed update onto the mapped customer', async () => {
    queryDal.mockResolvedValue({
      customer: { crn: '1102634220', info: { name: { first: 'FAKE' } } }
    })
    applyRecentUpdate.mockResolvedValue({ crn: '1102634220', info: { name: { first: 'James' } } })

    const result = await getCustomer('1102634220')

    expect(applyRecentUpdate).toHaveBeenCalledWith(
      'Customer',
      '1102634220',
      expect.objectContaining({ crn: '1102634220' })
    )
    expect(result).toEqual({ crn: '1102634220', info: { name: { first: 'James' } } })
  })

  test('forwards the crn and caller token to the DAL', async () => {
    queryDal.mockResolvedValue({})
    applyRecentUpdate.mockResolvedValue(null)

    await getCustomer('1102634220', { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { crn: '1102634220' },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })
})
