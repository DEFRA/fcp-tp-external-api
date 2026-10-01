import { describe, test, expect, vi, beforeEach } from 'vitest'

const queryDal = vi.fn()
const rememberUpdate = vi.fn()

vi.mock('../../../../src/dal/connector.js', () => ({
  queryDal: (...args) => queryDal(...args)
}))

vi.mock('../../../../src/update-echo/index.js', () => ({
  rememberUpdate: (...args) => rememberUpdate(...args)
}))

const { updateBusiness } = await import('../../../../src/services/business/update-business-service.js')

describe('updateBusiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rememberUpdate.mockResolvedValue(undefined)
  })

  test('returns the DAL mutation result', async () => {
    queryDal.mockResolvedValue({
      updateBusinessAllFields: { success: true, business: { sbi: '107183280' } }
    })

    const result = await updateBusiness({ sbi: '107183280', name: 'Henderson Family Farms' })

    expect(result).toEqual({ success: true, business: { sbi: '107183280' } })
  })

  test('returns null when the DAL response has no result', async () => {
    queryDal.mockResolvedValue({})

    expect(await updateBusiness({ sbi: '107183280' })).toBeNull()
  })

  test('forwards the input and caller token to the DAL', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: true } })

    const input = { sbi: '107183280', vat: '123456789' }
    await updateBusiness(input, { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { input },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })

  test('remembers a successful update for the echo cache', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: true } })

    const input = { sbi: '107183280', vat: '123456789' }
    await updateBusiness(input)

    expect(rememberUpdate).toHaveBeenCalledWith('Business', '107183280', { info: { vat: '123456789' } })
  })

  test('does not remember an unsuccessful update', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: false } })

    await updateBusiness({ sbi: '107183280', vat: '123456789' })

    expect(rememberUpdate).not.toHaveBeenCalled()
  })
})
