import { randomUUID } from 'node:crypto'
import { tracing } from '@defra/hapi-tracing'
import { config } from '../../config.js'

export const requestTracing = {
  plugin: {
    name: 'request-tracing',
    async register (server) {
      const tracingHeader = config.get('tracing.header')

      // CDP sets the header. Generating one otherwise still ties our audit events to the DAL's
      server.ext('onRequest', (request, h) => {
        request.headers[tracingHeader] ??= randomUUID()
        return h.continue
      })

      // Lets a third party quote the trace ID when they report a problem
      server.ext('onPreResponse', (request, h) => {
        const traceId = request.headers[tracingHeader]
        const { response } = request
        if (response.isBoom) {
          response.output.headers[tracingHeader] = traceId
        } else {
          response.header(tracingHeader, traceId)
        }
        return h.continue
      })

      await server.register({ plugin: tracing.plugin, options: { tracingHeader } })
    }
  }
}
