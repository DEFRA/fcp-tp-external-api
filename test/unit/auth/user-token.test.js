import { describe, test, expect } from 'vitest'
import { getTokenCrn, getUserToken } from '../../../src/auth/user-token.js'

function jwt (payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`
}

describe('getUserToken', () => {
  test('prefers x-forwarded-authorization', () => {
    const request = { headers: { 'x-forwarded-authorization': 'forwarded', authorization: 'other' } }

    expect(getUserToken(request)).toBe('forwarded')
  })

  test('falls back to authorization', () => {
    expect(getUserToken({ headers: { authorization: 'other' } })).toBe('other')
  })

  test('returns undefined when neither header is present', () => {
    expect(getUserToken({ headers: {} })).toBeUndefined()
  })
})

describe('getTokenCrn', () => {
  test('returns the contactId claim', () => {
    expect(getTokenCrn(jwt({ contactId: '1102634220' }))).toBe('1102634220')
  })

  test('accepts a Bearer prefix', () => {
    expect(getTokenCrn(`Bearer ${jwt({ contactId: '1102634220' })}`)).toBe('1102634220')
  })

  test('converts a numeric contactId to a string', () => {
    expect(getTokenCrn(jwt({ contactId: 1102634220 }))).toBe('1102634220')
  })

  test('returns null when there is no contactId', () => {
    expect(getTokenCrn(jwt({ sub: 'someone' }))).toBeNull()
  })

  test('returns null when contactId is not a string or number', () => {
    expect(getTokenCrn(jwt({ contactId: { crn: '1102634220' } }))).toBeNull()
  })

  test.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['a value that is not a JWT', 'not-a-jwt'],
    ['a payload that is not base64 JSON', 'header.%%%.signature'],
    ['a payload that is not JSON', `header.${Buffer.from('plain text').toString('base64url')}.signature`],
    ['a payload that is JSON null', `header.${Buffer.from('null').toString('base64url')}.signature`]
  ])('returns null for %s', (_name, token) => {
    expect(getTokenCrn(token)).toBeNull()
  })
})
