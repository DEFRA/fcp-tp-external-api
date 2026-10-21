import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { getTokenCrn, getUserToken } from '../auth/user-token.js'

const logger = createLogger()

const FORBIDDEN_MESSAGE = 'The signed-in user does not have permission to access this data'

function maskCrn (crn) {
  return crn ? `******${crn.slice(-4)}` : null
}

// Returns why the request must be refused, or null when it may go ahead.
function denialReason (request) {
  const token = getUserToken(request)
  if (!token) {
    return { reason: 'no-token' }
  }

  const crn = getTokenCrn(token)
  if (!crn) {
    return { reason: 'invalid-token' }
  }

  if (!config.get('crnRestriction.allowedCrns').includes(crn)) {
    return { reason: 'not-allowed', crn }
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

      server.ext('onPreAuth', (request, h) => {
        if (!config.get('crnRestriction.isEnabled') || request.route.path !== config.get('graphql.path')) {
          return h.continue
        }

        const denial = denialReason(request)
        if (!denial) {
          return h.continue
        }

        logger.warn(
          {
            event: { action: 'crn-restriction', outcome: 'failure', reason: denial.reason },
            ...(denial.crn && { user: { id: maskCrn(denial.crn) } })
          },
          'Request refused by CRN restriction'
        )

        return h
          .response({ errors: [{ message: FORBIDDEN_MESSAGE, extensions: { code: 'FORBIDDEN' } }] })
          .code(403)
          .takeover()
      })
    }
  }
}
