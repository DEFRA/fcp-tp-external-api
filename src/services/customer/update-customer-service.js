import { queryDal } from '../../dal/connector.js'
import { updateCustomerAllFieldsMutation } from '../../dal/queries/customer-mutations.js'
import { projectCustomerUpdate } from '../../update-echo/projections.js'
import { rememberUpdate } from '../../update-echo/index.js'

export async function updateCustomer (input, { forwardedUserToken } = {}) {
  const data = await queryDal(updateCustomerAllFieldsMutation, { input }, { forwardedUserToken })
  const result = data?.updateCustomerAllFields ?? null

  if (result?.success) {
    await rememberUpdate('Customer', input.crn, projectCustomerUpdate(input))
  }

  return result
}
