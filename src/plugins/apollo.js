import hapiApollo from '@as-integrations/hapi'
import { config } from '../config.js'
import { apolloServer } from '../graphql/server.js'
import { getUserToken } from '../auth/user-token.js'

export const apollo = {
  plugin: hapiApollo.default ?? hapiApollo,
  options: {
    apolloServer,
    path: config.get('graphql.path'),
    context: async ({ request }) => ({
      forwardedUserToken: getUserToken(request),
      logger: request.logger
    })
  }
}
