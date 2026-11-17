import { queryDal } from '../../dal/connector.js'
import { updateCustomerAllFieldsMutation } from '../../dal/queries/customer-mutations.js'
import { projectCustomerUpdate } from '../../update-echo/projections.js'
import { rememberUpdate } from '../../update-echo/index.js'
import { toDalAddress } from '../../mappers/address.js'

function toDalInput (input) {
  return Object.hasOwn(input, 'address')
    ? { ...input, address: toDalAddress(input.address) }
    : input
}

export async function updateCustomer (input, { forwardedUserToken } = {}) {
  const data = await queryDal(updateCustomerAllFieldsMutation, { input: toDalInput(input) }, { forwardedUserToken })
  const result = data?.updateCustomerAllFields ?? null

  if (result?.success) {
    await rememberUpdate('Customer', input.crn, projectCustomerUpdate(input))
  }

  return result
}
