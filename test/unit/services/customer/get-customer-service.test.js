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
      customer: { crn: '1234567890', info: { name: { first: 'FAKE' } } }
    })
    applyRecentUpdate.mockResolvedValue({ crn: '1234567890', info: { name: { first: 'James' } } })

    const result = await getCustomer('1234567890')

    expect(applyRecentUpdate).toHaveBeenCalledWith(
      'Customer',
      '1234567890',
      expect.objectContaining({ crn: '1234567890' })
    )
    expect(result).toEqual({ crn: '1234567890', info: { name: { first: 'James' } } })
  })

  test('forwards the crn and caller token to the DAL', async () => {
    queryDal.mockResolvedValue({})
    applyRecentUpdate.mockResolvedValue(null)

    await getCustomer('1234567890', { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { crn: '1234567890' },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })
})
