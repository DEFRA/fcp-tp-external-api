import { createLogger } from './logging/logger.js'

const logger = createLogger()

export function failAction (_request, _h, error) {
  // Joi messages can repeat the submitted value, so only the type is logged
  logger.warn({ error: { type: error?.name } }, 'Request failed validation')
  throw error
}
