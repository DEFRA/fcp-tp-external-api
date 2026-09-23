import { queryDal } from '../../dal/connector.js'
import { updateCustomerAllFieldsMutation } from '../../dal/queries/customer-mutations.js'

export async function updateCustomer (input, { forwardedUserToken } = {}) {
  const data = await queryDal(updateCustomerAllFieldsMutation, { input }, { forwardedUserToken })
  return data?.updateCustomerAllFields ?? null
}
