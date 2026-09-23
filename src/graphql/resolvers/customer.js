import { getCustomer } from '../../services/customer/get-customer-service.js'
import { updateCustomer } from '../../services/customer/update-customer-service.js'
import { assertValidCrn } from '../validation.js'

export const customerResolvers = {
  Query: {
    customer: (_parent, { crn }, context) => {
      assertValidCrn(crn)
      return getCustomer(crn, context)
    }
  },
  Mutation: {
    updateCustomerAllFields: (_parent, { input }, context) => {
      assertValidCrn(input.crn)
      return updateCustomer(input, context)
    }
  }
}
