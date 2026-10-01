import { queryDal } from '../../dal/connector.js'
import { updateBusinessAllFieldsMutation } from '../../dal/queries/business-mutations.js'
import { projectBusinessUpdate } from '../../update-echo/projections.js'
import { rememberUpdate } from '../../update-echo/index.js'

export async function updateBusiness (input, { forwardedUserToken } = {}) {
  const data = await queryDal(updateBusinessAllFieldsMutation, { input }, { forwardedUserToken })
  const result = data?.updateBusinessAllFields ?? null

  if (result?.success) {
    await rememberUpdate('Business', input.sbi, projectBusinessUpdate(input))
  }

  return result
}
