import { queryDal } from '../../dal/connector.js'
import { personalDetailsQuery } from '../../dal/queries/personal-details.js'
import { mapCustomer } from '../../mappers/index.js'

export async function getCustomer (crn, { forwardedUserToken } = {}) {
  const data = await queryDal(personalDetailsQuery, { crn }, { forwardedUserToken })
  return mapCustomer(data?.customer)
}
