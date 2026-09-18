import { config } from '../../config.js'
import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'

export async function startServer () {
  let server

  try {
    server = await createServer()
    await server.start()

    server.logger.info('Server started successfully')
    server.logger.info(
      `Access the GraphQL API on http://localhost:${config.get('port')}${config.get('graphql.path')}`
    )
  } catch (err) {
    const logger = createLogger()
    logger.info('Server failed to start')
    logger.error(err)
  }

  return server
}
