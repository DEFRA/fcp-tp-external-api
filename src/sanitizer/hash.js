import crypto from 'node:crypto'

// The field path is part of the HMAC input so the same value appearing in two
// different fields does not produce the same substitution.
export function createSeed (value, secret, fieldPath) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${fieldPath}:${value}`)
    .digest('hex')
}
