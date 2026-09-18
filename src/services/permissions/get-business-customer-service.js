import { queryDal } from '../../dal/connector.js'
import { permissionsQuery } from '../../dal/queries/permissions.js'
import { mapPermissionGroups } from '../../mappers/index.js'

export async function getBusinessCustomer (sbi, crn, { forwardedUserToken } = {}) {
  const data = await queryDal(permissionsQuery, { sbi, crn }, { forwardedUserToken })
  const customer = data?.business?.customer

  if (!customer) {
    return null
  }

  return {
    crn,
    permissionGroups: mapPermissionGroups(customer.permissionGroups)
  }
}
