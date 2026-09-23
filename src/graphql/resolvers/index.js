import { businessResolvers } from './business.js'
import { customerResolvers } from './customer.js'

export const resolvers = {
  Query: {
    ...businessResolvers.Query,
    ...customerResolvers.Query
  },
  Mutation: {
    ...businessResolvers.Mutation,
    ...customerResolvers.Mutation
  },
  Business: {
    ...businessResolvers.Business
  }
}
