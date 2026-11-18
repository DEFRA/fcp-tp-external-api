import { getBusiness } from '../../services/business/get-business-service.js'
import { updateBusiness } from '../../services/business/update-business-service.js'
import { getBusinessCustomer } from '../../services/permissions/get-business-customer-service.js'
import { assertValidSbi, assertValidCrn, assertValidAddress } from '../validation.js'
import { audited } from '../../audit/audited.js'

export const businessResolvers = {
  Query: {
    business: audited(
      (_parent, { sbi }, business) => ({
        entity: 'business',
        action: 'read',
        entityid: sbi,
        accounts: { sbi, organisationId: business?.organisationId }
      }),
      (_parent, { sbi }, context) => {
        assertValidSbi(sbi)
        return getBusiness(sbi, context)
      }
    )
  },
  Mutation: {
    updateBusinessAllFields: audited(
      (_parent, { input }) => ({ entity: 'business', action: 'updated', entityid: input.sbi, accounts: { sbi: input.sbi } }),
      (_parent, { input }, context) => {
        assertValidSbi(input.sbi)
        assertValidAddress(input.address, 'address')
        assertValidAddress(input.correspondenceAddress, 'correspondenceAddress')
        return updateBusiness(input, context)
      }
    )
  },
  Business: {
    customer: audited(
      (business, { crn }) => ({
        entity: 'permission-list',
        action: 'read',
        entityid: `${business.sbi}-${crn}`,
        accounts: { sbi: business.sbi, crn }
      }),
      (business, { crn }, context) => {
        assertValidCrn(crn)
        return getBusinessCustomer(business.sbi, crn, context)
      }
    )
  }
}
