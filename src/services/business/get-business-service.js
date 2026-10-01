import { queryDal } from '../../dal/connector.js'
import { businessDetailsQuery } from '../../dal/queries/business-details.js'
import { mapBusiness } from '../../mappers/index.js'
import { applyRecentUpdate } from '../../update-echo/index.js'

export async function getBusiness (sbi, { forwardedUserToken } = {}) {
  const data = await queryDal(businessDetailsQuery, { sbi }, { forwardedUserToken })
  return applyRecentUpdate('Business', sbi, mapBusiness(data?.business))
}
