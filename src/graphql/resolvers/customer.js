import { getCustomer } from '../../services/customer/get-customer-service.js'
import { assertValidCrn } from '../validation.js'

export const customerResolvers = {
  Query: {
    customer: (_parent, { crn }, context) => {
      assertValidCrn(crn)
      return getCustomer(crn, context)
    }
  }
}
