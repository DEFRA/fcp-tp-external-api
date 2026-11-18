import { config } from '../config.js'
import { getTokenClaims, getUserToken } from '../auth/user-token.js'

const MAX_IP_LENGTH = 20
const MAX_IDENTITY_LENGTH = 50

export function getCorrelationId (request) {
  return request.headers[config.get('tracing.header')]
}

// For a backend API the audit ip is the calling service's. The schema rejects an empty one.
function getCallerIp (request) {
  const forwardedFor = request.headers['x-forwarded-for']?.split(',')[0].trim()
  let ip = (forwardedFor || request.info.remoteAddress || '').split('%')[0]

  if ((ip.match(/:/g) ?? []).length === 1) {
    ip = ip.split(':')[0]
  }

  return ip.slice(0, MAX_IP_LENGTH) || 'unknown'
}

// An oversized claim from an unverified token would fail validation and lose the whole event
function fits (value) {
  return value && value.length <= MAX_IDENTITY_LENGTH ? value : undefined
}

export function buildAuditEvent (request, audit) {
  const { crn, sessionId, azp } = getTokenClaims(getUserToken(request))
  const user = fits(crn && `IDM/${crn}`)
  const sessionid = fits(sessionId)

  return {
    correlationid: getCorrelationId(request),
    datetime: new Date(request.info.received).toISOString(),
    ip: getCallerIp(request),
    ...(user && { user }),
    ...(sessionid && { sessionid }),
    security: null,
    audit: {
      ...audit,
      details: {
        ...audit.details,
        ...(azp && { sourceSystemEntityId: azp })
      }
    }
  }
}
