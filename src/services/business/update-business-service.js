import { queryDal } from '../../dal/connector.js'
import { updateBusinessAllFieldsMutation } from '../../dal/queries/business-mutations.js'

export async function updateBusiness (input, { forwardedUserToken } = {}) {
  const data = await queryDal(updateBusinessAllFieldsMutation, { input }, { forwardedUserToken })
  return data?.updateBusinessAllFields ?? null
}
