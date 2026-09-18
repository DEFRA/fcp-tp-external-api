import { businessResolvers } from './business.js'
import { customerResolvers } from './customer.js'

export const resolvers = {
  Query: {
    ...businessResolvers.Query,
    ...customerResolvers.Query
  },
  Business: {
    ...businessResolvers.Business
  }
}
