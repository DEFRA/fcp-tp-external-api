import { describe, test, expect } from 'vitest'
import { buildAuditEvent, getCorrelationId } from '../../../src/audit/event.js'

function jwt (payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`
}

function request ({ headers = {}, remoteAddress = '10.0.0.1' } = {}) {
  return {
    headers: { 'x-cdp-request-id': 'trace-1', ...headers },
    info: { received: Date.UTC(2026, 10, 17, 9, 30), remoteAddress }
  }
}

const audit = {
  entities: [{ entity: 'person', action: 'read', entityid: '1000000001' }],
  accounts: { crn: '1000000001' },
  status: 'success',
  details: { rootField: 'customer' }
}

describe('getCorrelationId', () => {
  test('returns the tracing header', () => {
    expect(getCorrelationId(request())).toBe('trace-1')
  })
})

describe('buildAuditEvent', () => {
  test('identifies the user, session and third party from the Defra ID token', () => {
    const token = jwt({ contactId: '1000000001', sessionId: 'session-1', azp: 'third-party-client' })

    const event = buildAuditEvent(request({ headers: { 'x-forwarded-authorization': token } }), audit)

    expect(event).toEqual({
      correlationid: 'trace-1',
      datetime: '2026-11-17T09:30:00.000Z',
      ip: '10.0.0.1',
      user: 'IDM/1000000001',
      sessionid: 'session-1',
      security: null,
      audit: {
        ...audit,
        details: { rootField: 'customer', sourceSystemEntityId: 'third-party-client' }
      }
    })
  })

  test('leaves out the identity fields when there is no token', () => {
    const event = buildAuditEvent(request(), audit)

    expect(event).not.toHaveProperty('user')
    expect(event).not.toHaveProperty('sessionid')
    expect(event.audit.details).toEqual({ rootField: 'customer' })
  })

  test('leaves out claims too long for the audit schema', () => {
    const token = jwt({ contactId: '1'.repeat(50), sessionId: 's'.repeat(51) })

    const event = buildAuditEvent(request({ headers: { 'x-forwarded-authorization': token } }), audit)

    expect(event).not.toHaveProperty('user')
    expect(event).not.toHaveProperty('sessionid')
  })

  describe('ip', () => {
    test.each([
      ['the first x-forwarded-for entry', { 'x-forwarded-for': '203.0.113.7, 10.0.0.2' }, '10.0.0.1', '203.0.113.7'],
      ['the remote address without x-forwarded-for', {}, '10.0.0.1', '10.0.0.1'],
      ['an IPv4 address without its port', { 'x-forwarded-for': '203.0.113.7:443' }, undefined, '203.0.113.7'],
      ['an IPv6 address without its zone', {}, 'fe80::1%eth0', 'fe80::1'],
      ['a long IPv6 address cut to 20 characters', {}, '2001:0db8:85a3:0000:0000:8a2e:0370:7334', '2001:0db8:85a3:0000:'],
      ['unknown when nothing is available', {}, null, 'unknown']
    ])('uses %s', (_name, headers, remoteAddress, expected) => {
      expect(buildAuditEvent(request({ headers, remoteAddress }), audit).ip).toBe(expected)
    })
  })
})
