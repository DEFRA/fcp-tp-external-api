import { describe, test, expect, vi, beforeEach } from 'vitest'

const queryDal = vi.fn()
const applyRecentUpdate = vi.fn()

vi.mock('../../../../src/dal/connector.js', () => ({
  queryDal: (...args) => queryDal(...args)
}))

vi.mock('../../../../src/update-echo/index.js', () => ({
  applyRecentUpdate: (...args) => applyRecentUpdate(...args)
}))

const { getBusiness } = await import('../../../../src/services/business/get-business-service.js')

describe('getBusiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('overlays any recently echoed update onto the mapped business', async () => {
    queryDal.mockResolvedValue({
      business: { organisationId: '5565448', sbi: '123456789', info: { vat: 'FAKE1' } }
    })
    applyRecentUpdate.mockResolvedValue({ sbi: '123456789', info: { vat: '987654321' } })

    const result = await getBusiness('123456789')

    expect(applyRecentUpdate).toHaveBeenCalledWith(
      'Business',
      '123456789',
      expect.objectContaining({ sbi: '123456789' })
    )
    expect(result).toEqual({ sbi: '123456789', info: { vat: '987654321' } })
  })

  test('forwards the sbi and caller token to the DAL', async () => {
    queryDal.mockResolvedValue({})
    applyRecentUpdate.mockResolvedValue(null)

    await getBusiness('123456789', { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { sbi: '123456789' },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })
})
