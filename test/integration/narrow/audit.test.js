import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { validateAuditEvent } from '@defra/fcp-audit-publisher'
import { dalResponses, mockDal, graphqlRequest } from './helpers.js'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'
import { config } from '../../../src/config.js'

const mockPublishAuditEvent = vi.hoisted(() => vi.fn())

vi.mock('@defra/fcp-audit-publisher', async (importOriginal) => ({
  ...(await importOriginal()),
  publishAuditEvent: mockPublishAuditEvent
}))

vi.mock('../../../src/services/dal/token/get-token-service.js', () => ({
  getToken: vi.fn().mockResolvedValue('Bearer a-service-token')
}))

const SBI = '123456789'
const CRN = '1000000001'

const BUSINESS_QUERY = `
  query Business($sbi: ID!, $crn: ID!) {
    farm: business(sbi: $sbi) {
      sbi
      info { name }
      customer(crn: $crn) { permissionGroups { id level } }
    }
  }
`

const CUSTOMER_QUERY = `
  query Customer($crn: ID!) {
    customer(crn: $crn) { crn info { name { first } } }
  }
`

const UPDATE_BUSINESS_MUTATION = `
  mutation Update($input: UpdateBusinessAllFieldsInput!) {
    updateBusinessAllFields(input: $input) { success }
  }
`

const UPDATE_CUSTOMER_MUTATION = `
  mutation Update($input: UpdateCustomerAllFieldsInput!) {
    updateCustomerAllFields(input: $input) { success }
  }
`

function defraIdToken (claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`
}

const user = {
  'x-forwarded-authorization': defraIdToken({ contactId: CRN, sessionId: 'session-1', azp: 'third-party-client' }),
  'x-forwarded-for': '203.0.113.7',
  'x-cdp-request-id': 'trace-1'
}

// Applies the same defaults the real publisher would before validating
function publishedEvents () {
  return mockPublishAuditEvent.mock.calls.map(([event, { application, component, environment }]) => ({
    version: '1.0.0',
    application,
    component,
    environment,
    ...event
  }))
}

let server

beforeAll(async () => {
  server = await createServer()
  await server.initialize()
})

afterAll(async () => {
  await server.stop({ timeout: 0 })
  await stopApolloServer()
})

beforeEach(() => {
  config.set('audit.isEnabled', true)
  config.set('audit.snsTopicArn', 'arn:aws:sns:eu-west-2:000000000000:audit')
})

afterEach(() => {
  config.set('audit.isEnabled', false)
  config.set('audit.snsTopicArn', null)
  config.set('crnRestriction.isEnabled', false)
  config.set('crnRestriction.allowedCrns', [])
  vi.unstubAllGlobals()
})

describe('auditing', () => {
  test('publishes a valid event for a business read, including nested permissions and the data returned', async () => {
    mockDal({ business: { ...dalResponses.business, customer: { permissionGroups: dalResponses.permissionGroups } } })

    const response = await graphqlRequest(server, BUSINESS_QUERY, { sbi: SBI, crn: CRN }, user)
    const { data } = JSON.parse(response.payload)

    const [event] = publishedEvents()
    expect(publishedEvents()).toHaveLength(1)
    expect(validateAuditEvent(event).valid).toBe(true)
    expect(event).toMatchObject({
      application: 'FAL Third Party API',
      component: 'fcp-tp-external-api',
      environment: 'local',
      correlationid: 'trace-1',
      user: `IDM/${CRN}`,
      sessionid: 'session-1',
      ip: '203.0.113.7',
      audit: {
        entities: [
          { entity: 'business', action: 'read', entityid: SBI },
          { entity: 'permission-list', action: 'read', entityid: `${SBI}-${CRN}` }
        ],
        accounts: { sbi: SBI, organisationId: dalResponses.business.organisationId, crn: CRN },
        status: 'success',
        details: {
          rootField: 'farm',
          arguments: JSON.stringify({ sbi: SBI }),
          sourceSystemEntityId: 'third-party-client'
        }
      }
    })
    expect(JSON.parse(event.audit.details.responseBody)).toEqual(data.farm)
  })

  test('publishes a valid event for a customer read', async () => {
    mockDal({ customer: dalResponses.customer })

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, user)

    const [event] = publishedEvents()
    expect(validateAuditEvent(event).valid).toBe(true)
    expect(event.audit).toMatchObject({
      entities: [{ entity: 'person', action: 'read', entityid: CRN }],
      accounts: { crn: CRN },
      status: 'success'
    })
  })

  test('publishes the full input of a business update', async () => {
    mockDal({ updateBusinessAllFields: { success: true } })
    const input = { sbi: SBI, name: 'New Farm Name', email: { address: 'farm@example.com' } }

    await graphqlRequest(server, UPDATE_BUSINESS_MUTATION, { input }, user)

    const [event] = publishedEvents()
    expect(validateAuditEvent(event).valid).toBe(true)
    expect(event.audit).toMatchObject({
      entities: [{ entity: 'business', action: 'updated', entityid: SBI }],
      accounts: { sbi: SBI },
      status: 'success'
    })
    expect(JSON.parse(event.audit.details.arguments)).toEqual({ input })
  })

  test('publishes the full input of a customer update', async () => {
    mockDal({ updateCustomerAllFields: { success: true } })
    const input = { crn: CRN, first: 'Alice', dateOfBirth: '1980-01-01' }

    await graphqlRequest(server, UPDATE_CUSTOMER_MUTATION, { input }, user)

    const [event] = publishedEvents()
    expect(event.audit.entities).toEqual([{ entity: 'person', action: 'updated', entityid: CRN }])
    expect(JSON.parse(event.audit.details.arguments)).toEqual({ input })
  })

  test('publishes a denied event when the DAL refuses the user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }] })
    }))

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, user)

    const [event] = publishedEvents()
    expect(validateAuditEvent(event).valid).toBe(true)
    expect(event.audit).toMatchObject({
      entities: [{ entity: 'person', action: 'read', entityid: CRN }],
      status: 'denied',
      details: { responseBody: 'null', errorCodes: ['FORBIDDEN'] }
    })
  })

  test('publishes a denied event when the CRN restriction refuses the user', async () => {
    config.set('crnRestriction.isEnabled', true)
    config.set('crnRestriction.allowedCrns', ['1000000002'])

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, user)

    expect(response.statusCode).toBe(403)
    const [event] = publishedEvents()
    expect(validateAuditEvent(event).valid).toBe(true)
    expect(event).toMatchObject({
      correlationid: 'trace-1',
      user: `IDM/${CRN}`,
      audit: {
        entities: [{ entity: 'request', action: 'rejected', entityid: 'trace-1' }],
        status: 'denied',
        details: { reason: 'not-allowed', sourceSystemEntityId: 'third-party-client' }
      }
    })
  })

  test('publishes nothing for a validation error', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: 'not-a-crn' }, user)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockPublishAuditEvent).not.toHaveBeenCalled()
  })

  test('publishes nothing for a DAL failure unrelated to authorisation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, user)

    expect(mockPublishAuditEvent).not.toHaveBeenCalled()
  })

  test('publishes nothing when auditing is disabled', async () => {
    config.set('audit.isEnabled', false)
    mockDal({ customer: dalResponses.customer })

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, user)

    expect(mockPublishAuditEvent).not.toHaveBeenCalled()
  })

  test('still responds when publishing fails', async () => {
    mockPublishAuditEvent.mockRejectedValueOnce(new Error('SNS unavailable'))
    mockDal({ customer: dalResponses.customer })

    const response = await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, user)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload).data.customer.crn).toBe(dalResponses.customer.crn)
  })
})

describe('correlation with the DAL', () => {
  test('forwards the incoming trace id to the DAL', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, user)

    expect(fetchMock.mock.calls[0][1].headers['x-cdp-request-id']).toBe('trace-1')
  })

  test('generates a trace id when none arrives and uses it for both the DAL and the audit event', async () => {
    const fetchMock = mockDal({ customer: dalResponses.customer })
    const { 'x-cdp-request-id': _traceId, ...withoutTraceId } = user

    await graphqlRequest(server, CUSTOMER_QUERY, { crn: CRN }, withoutTraceId)

    const forwarded = fetchMock.mock.calls[0][1].headers['x-cdp-request-id']
    expect(forwarded).toMatch(/^[0-9a-f-]{36}$/)
    expect(publishedEvents()[0].correlationid).toBe(forwarded)
  })
})
