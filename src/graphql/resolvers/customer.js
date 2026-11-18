import { getCustomer } from '../../services/customer/get-customer-service.js'
import { updateCustomer } from '../../services/customer/update-customer-service.js'
import { assertValidCrn, assertValidAddress } from '../validation.js'
import { audited } from '../../audit/audited.js'

export const customerResolvers = {
  Query: {
    customer: audited(
      (_parent, { crn }) => ({ entity: 'person', action: 'read', entityid: crn, accounts: { crn } }),
      (_parent, { crn }, context) => {
        assertValidCrn(crn)
        return getCustomer(crn, context)
      }
    )
  },
  Mutation: {
    updateCustomerAllFields: audited(
      (_parent, { input }) => ({ entity: 'person', action: 'updated', entityid: input.crn, accounts: { crn: input.crn } }),
      (_parent, { input }, context) => {
        assertValidCrn(input.crn)
        assertValidAddress(input.address, 'address')
        return updateCustomer(input, context)
      }
    )
  }
}
