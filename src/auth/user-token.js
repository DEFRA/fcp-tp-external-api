// The Defra ID token the caller presented, which is forwarded to the DAL unchanged. Our own Entra
// token identifies this service, theirs identifies the end user.
export function getUserToken (request) {
  return request.headers['x-forwarded-authorization'] ?? request.headers.authorization
}

// Reads the CRN (the contactId claim) from a Defra ID token. The signature is deliberately not
// verified here: the DAL verifies it on every call, so a forged token is rejected there.
export function getTokenCrn (token) {
  if (typeof token !== 'string') {
    return null
  }

  const [, payload] = token.replace(/^Bearer\s+/i, '').split('.')
  if (!payload) {
    return null
  }

  try {
    const { contactId } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof contactId === 'string' || typeof contactId === 'number' ? String(contactId) : null
  } catch {
    return null
  }
}
