import Hapi from '@hapi/hapi'
import { secureContext } from '@defra/hapi-secure-context'
import { metrics } from '@defra/cdp-metrics'
import { config } from './config.js'
import { router } from './plugins/router.js'
import { apollo } from './plugins/apollo.js'
import { requestLogger } from './common/helpers/logging/request-logger.js'
import { failAction } from './common/helpers/fail-action.js'
import { pulse } from './common/helpers/pulse.js'
import { requestTracing } from './common/helpers/request-tracing.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { start as startApolloServer } from './graphql/server.js'

export async function createServer () {
  setupProxy()
  await startApolloServer()

  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Hapi Plugins:
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // apollo         - serves the GraphQL API
  // router         - routes used in the app
  await server.register([
    requestLogger,
    requestTracing,
    metrics,
    secureContext,
    pulse,
    apollo,
    router
  ])

  return server
}
