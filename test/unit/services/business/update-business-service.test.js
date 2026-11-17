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
      updateBusinessAllFields: { success: true, business: { sbi: '123456789' } }
    })

    const result = await updateBusiness({ sbi: '123456789', name: 'Henderson Family Farms' })

    expect(result).toEqual({ success: true, business: { sbi: '123456789' } })
  })

  test('returns null when the DAL response has no result', async () => {
    queryDal.mockResolvedValue({})

    expect(await updateBusiness({ sbi: '123456789' })).toBeNull()
  })

  test('forwards the input and caller token to the DAL', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: true } })

    const input = { sbi: '123456789', vat: '987654321' }
    await updateBusiness(input, { forwardedUserToken: 'Bearer a-token' })

    expect(queryDal).toHaveBeenCalledWith(
      expect.any(String),
      { input },
      { forwardedUserToken: 'Bearer a-token' }
    )
  })

  test('remembers a successful update for the echo cache', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: true } })

    const input = { sbi: '123456789', vat: '987654321' }
    await updateBusiness(input)

    expect(rememberUpdate).toHaveBeenCalledWith('Business', '123456789', { info: { vat: '987654321' } })
  })

  test('sends a manual address to the DAL as withoutUprn', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: true } })

    const address = { line1: '1 New Street', city: 'Leeds', county: 'West Yorkshire', postalCode: 'LS1 1AA', country: 'UK' }
    await updateBusiness({ sbi: '123456789', address, correspondenceAddress: address })

    const [, { input }] = queryDal.mock.calls[0]
    expect(input.address.withoutUprn).toMatchObject({ line1: '1 New Street', line4: 'West Yorkshire', county: null })
    expect(input.correspondenceAddress.withoutUprn).toMatchObject({ line1: '1 New Street' })
  })

  test('sends an address with a UPRN to the DAL as withUprn', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: true } })

    const address = { line1: '1 New Street', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK', uprn: '100012345678' }
    await updateBusiness({ sbi: '123456789', address })

    const [, { input }] = queryDal.mock.calls[0]
    expect(input.address.withUprn).toMatchObject({ buildingName: '1 New Street', line1: null, uprn: '100012345678' })
    expect(input).not.toHaveProperty('correspondenceAddress')
  })

  test('does not remember an unsuccessful update', async () => {
    queryDal.mockResolvedValue({ updateBusinessAllFields: { success: false } })

    await updateBusiness({ sbi: '123456789', vat: '987654321' })

    expect(rememberUpdate).not.toHaveBeenCalled()
  })
})
