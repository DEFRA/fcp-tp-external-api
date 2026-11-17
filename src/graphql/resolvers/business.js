import { getBusiness } from '../../services/business/get-business-service.js'
import { updateBusiness } from '../../services/business/update-business-service.js'
import { getBusinessCustomer } from '../../services/permissions/get-business-customer-service.js'
import { assertValidSbi, assertValidCrn, assertValidAddress } from '../validation.js'

export const businessResolvers = {
  Query: {
    business: (_parent, { sbi }, context) => {
      assertValidSbi(sbi)
      return getBusiness(sbi, context)
    }
  },
  Mutation: {
    updateBusinessAllFields: (_parent, { input }, context) => {
      assertValidSbi(input.sbi)
      assertValidAddress(input.address, 'address')
      assertValidAddress(input.correspondenceAddress, 'correspondenceAddress')
      return updateBusiness(input, context)
    }
  },
  Business: {
    customer: (business, { crn }, context) => {
      assertValidCrn(crn)
      return getBusinessCustomer(business.sbi, crn, context)
    }
  }
}
