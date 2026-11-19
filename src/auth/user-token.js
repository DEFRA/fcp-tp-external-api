// The Defra ID token the caller presented, which is forwarded to the DAL unchanged. Our own Entra
// token identifies this service, theirs identifies the end user.
export function getUserToken (request) {
  return request.headers['x-forwarded-authorization'] ?? request.headers.authorization
}

function asString (value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

// Reads the claims we need from a Defra ID token. The signature is deliberately not verified here:
// the DAL verifies it on every call, so a forged token is rejected there.
export function getTokenClaims (token) {
  if (typeof token !== 'string') {
    return {}
  }

  const [, payload] = token.replace(/^Bearer\s+/i, '').split('.')
  if (!payload) {
    return {}
  }

  try {
    const { contactId, sessionId, azp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return { crn: asString(contactId), sessionId: asString(sessionId), azp: asString(azp) }
  } catch {
    return {}
  }
}

// The CRN is the contactId claim.
export function getTokenCrn (token) {
  return getTokenClaims(token).crn ?? null
}

const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The third party's Defra ID client ID (azp). Unverified, so anything other than a GUID is dropped.
export function getCallerClientId (token) {
  const { azp } = getTokenClaims(token)
  return CLIENT_ID_PATTERN.test(azp ?? '') ? azp : undefined
}
