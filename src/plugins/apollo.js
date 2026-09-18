import hapiApollo from '@as-integrations/hapi'
import { config } from '../config.js'
import { apolloServer } from '../graphql/server.js'

// The third party's Defra ID token is forwarded to the DAL unchanged. Our own
// Entra token identifies this service, theirs identifies the end user.
function forwardedUserToken (request) {
  return request.headers['x-forwarded-authorization'] ?? request.headers.authorization
}

export const apollo = {
  plugin: hapiApollo.default ?? hapiApollo,
  options: {
    apolloServer,
    path: config.get('graphql.path'),
    context: async ({ request }) => ({
      forwardedUserToken: forwardedUserToken(request),
      logger: request.logger
    })
  }
}
