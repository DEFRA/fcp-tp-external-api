import { describe, test, expect, vi } from 'vitest'
import { GraphQLError } from 'graphql'
import { audited } from '../../../src/audit/audited.js'

const describeRead = (_parent, { sbi }, business) => ({
  entity: 'business',
  action: 'read',
  entityid: sbi,
  accounts: { sbi, organisationId: business?.organisationId }
})

function rootInfo (key = 'business') {
  return { path: { key, prev: undefined } }
}

function auditContext () {
  return { audit: { request: {}, entries: new Map() } }
}

function graphqlError (code, extensions = {}) {
  return new GraphQLError('error', { extensions: { code, ...extensions } })
}

describe('audited', () => {
  test('only calls the resolver when auditing is disabled', async () => {
    const resolver = vi.fn().mockResolvedValue({ sbi: '123456789' })

    const result = await audited(describeRead, resolver)(null, { sbi: '123456789' }, { audit: null }, rootInfo())

    expect(result).toEqual({ sbi: '123456789' })
  })

  test('records a successful read against its root field', async () => {
    const context = auditContext()
    const resolver = vi.fn().mockResolvedValue({ sbi: '123456789', organisationId: 5565448 })

    await audited(describeRead, resolver)(null, { sbi: '123456789' }, context, rootInfo('farm'))

    expect(context.audit.entries.get('farm')).toEqual({
      arguments: { sbi: '123456789' },
      entities: [{ entity: 'business', action: 'read', entityid: '123456789' }],
      accounts: { sbi: '123456789', organisationId: '5565448' },
      errorCodes: []
    })
  })

  test('leaves out accounts with no value', async () => {
    const context = auditContext()

    await audited(describeRead, vi.fn().mockResolvedValue(null))(null, { sbi: '123456789' }, context, rootInfo())

    expect(context.audit.entries.get('business').accounts).toEqual({ sbi: '123456789' })
  })

  test('records a nested resolver under its root, keeping the root arguments', async () => {
    const context = auditContext()
    await audited(describeRead, vi.fn().mockResolvedValue({}))(null, { sbi: '123456789' }, context, rootInfo())

    const describeCustomer = (business, { crn }) => ({
      entity: 'permission-list',
      action: 'read',
      entityid: `${business.sbi}-${crn}`,
      accounts: { crn }
    })
    const nestedInfo = { path: { key: 'customer', prev: { key: 'business', prev: undefined } } }
    await audited(describeCustomer, vi.fn().mockResolvedValue({}))({ sbi: '123456789' }, { crn: '1000000001' }, context, nestedInfo)

    expect(context.audit.entries.get('business')).toEqual({
      arguments: { sbi: '123456789' },
      entities: [
        { entity: 'business', action: 'read', entityid: '123456789' },
        { entity: 'permission-list', action: 'read', entityid: '123456789-1000000001' }
      ],
      accounts: { sbi: '123456789', crn: '1000000001' },
      errorCodes: []
    })
  })

  test.each([
    ['UNAUTHORIZED', graphqlError('UNAUTHORIZED'), 'UNAUTHORIZED'],
    ['UNAUTHENTICATED', graphqlError('UNAUTHENTICATED'), 'UNAUTHENTICATED'],
    ['FORBIDDEN', graphqlError('FORBIDDEN'), 'FORBIDDEN'],
    ['a DAL 403', graphqlError('DAL_REQUEST_REJECTED', { status: 403, dalCode: 'FORBIDDEN' }), 'FORBIDDEN'],
    ['a DAL 401 with no DAL code', graphqlError('DAL_REQUEST_REJECTED', { status: 401 }), 'DAL_REQUEST_REJECTED']
  ])('records %s as a denial and rethrows', async (_name, error, expectedCode) => {
    const context = auditContext()

    await expect(
      audited(describeRead, vi.fn().mockRejectedValue(error))(null, { sbi: '123456789' }, context, rootInfo())
    ).rejects.toBe(error)

    expect(context.audit.entries.get('business')).toMatchObject({
      entities: [{ entity: 'business', action: 'read', entityid: '123456789' }],
      errorCodes: [expectedCode]
    })
  })

  test.each([
    ['a validation error', graphqlError('BAD_USER_INPUT')],
    ['a DAL 404', graphqlError('DAL_REQUEST_REJECTED', { status: 404 })],
    ['an unreachable DAL', graphqlError('DAL_UNAVAILABLE')],
    ['an error with no code', new Error('boom')]
  ])('records nothing for %s', async (_name, error) => {
    const context = auditContext()

    await expect(
      audited(describeRead, vi.fn().mockRejectedValue(error))(null, { sbi: '123456789' }, context, rootInfo())
    ).rejects.toBe(error)

    expect(context.audit.entries.size).toBe(0)
  })
})
