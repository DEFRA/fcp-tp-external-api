import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { getTokenCrn, getUserToken } from '../auth/user-token.js'
import { buildAuditEvent, getCorrelationId } from '../audit/event.js'
import { publish } from '../audit/publish.js'

const logger = createLogger()

const FORBIDDEN_MESSAGE = 'The signed-in user does not have permission to access this data'

// Returns why the request must be refused, or null when it may go ahead.
function denialReason (request) {
  const token = getUserToken(request)
  if (!token) {
    return 'no-token'
  }

  const crn = getTokenCrn(token)
  if (!crn) {
    return 'invalid-token'
  }

  if (!config.get('crnRestriction.allowedCrns').includes(crn)) {
    return 'not-allowed'
  }

  return null
}

function logStartupState () {
  if (!config.get('crnRestriction.isEnabled')) {
    logger.warn('CRN restriction is disabled: any CRN may use the API')
    return
  }

  const allowed = config.get('crnRestriction.allowedCrns').length
  if (allowed === 0) {
    logger.warn('CRN restriction is enabled but ALLOWED_CRNS is empty: every request will be refused')
  } else {
    logger.info(`CRN restriction is enabled for ${allowed} allowed CRN(s)`)
  }
}

export const crnRestriction = {
  plugin: {
    name: 'crn-restriction',
    register: (server) => {
      logStartupState()

      server.ext('onPreAuth', async (request, h) => {
        if (!config.get('crnRestriction.isEnabled') || request.route.path !== config.get('graphql.path')) {
          return h.continue
        }

        const reason = denialReason(request)
        if (!reason) {
          return h.continue
        }

        logger.warn(
          { event: { action: 'crn-restriction', outcome: 'failure', reason } },
          'Request refused by CRN restriction'
        )

        if (config.get('audit.isEnabled')) {
          await publish(buildAuditEvent(request, {
            entities: [{ entity: 'request', action: 'rejected', entityid: getCorrelationId(request) }],
            status: 'denied',
            details: { reason }
          }))
        }

        return h
          .response({ errors: [{ message: FORBIDDEN_MESSAGE, extensions: { code: 'FORBIDDEN' } }] })
          .code(403)
          .takeover()
      })
    }
  }
}
