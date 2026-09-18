import { getBusiness } from '../../services/business/get-business-service.js'
import { getBusinessCustomer } from '../../services/permissions/get-business-customer-service.js'
import { assertValidSbi, assertValidCrn } from '../validation.js'

export const businessResolvers = {
  Query: {
    business: (_parent, { sbi }, context) => {
      assertValidSbi(sbi)
      return getBusiness(sbi, context)
    }
  },
  Business: {
    customer: (business, { crn }, context) => {
      assertValidCrn(crn)
      return getBusinessCustomer(business.sbi, crn, context)
    }
  }
}
