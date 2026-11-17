import { describe, test, expect, vi } from 'vitest'

const mockPublish = vi.hoisted(() => vi.fn())

vi.mock('../../../src/audit/publish.js', () => ({
  publish: mockPublish
}))

const { auditPlugin } = await import('../../../src/audit/plugin.js')

const request = {
  headers: { 'x-cdp-request-id': 'trace-1' },
  info: { received: Date.UTC(2026, 10, 17), remoteAddress: '10.0.0.1' }
}

async function sendResponse (entries, data, kind = 'single') {
  const hooks = await auditPlugin.requestDidStart()
  await hooks.willSendResponse({
    contextValue: { audit: entries && { request, entries: new Map(entries) } },
    response: { body: kind === 'single' ? { kind, singleResult: { data } } : { kind } }
  })
}

const businessEntry = {
  arguments: { sbi: '123456789' },
  entities: [{ entity: 'business', action: 'read', entityid: '123456789' }],
  accounts: { sbi: '123456789' },
  errorCodes: []
}

describe('auditPlugin', () => {
  test('publishes one event per root field with the data returned for it', async () => {
    const customerEntry = {
      arguments: { crn: '1000000001' },
      entities: [{ entity: 'person', action: 'read', entityid: '1000000001' }],
      accounts: { crn: '1000000001' },
      errorCodes: []
    }

    await sendResponse(
      [['farm', businessEntry], ['customer', customerEntry]],
      { farm: { sbi: '123456789', info: { name: 'Farm' } }, customer: { crn: '1000000001' } }
    )

    expect(mockPublish).toHaveBeenCalledTimes(2)
    expect(mockPublish.mock.calls[0][0]).toMatchObject({
      correlationid: 'trace-1',
      audit: {
        entities: businessEntry.entities,
        accounts: businessEntry.accounts,
        status: 'success',
        details: {
          rootField: 'farm',
          arguments: '{"sbi":"123456789"}',
          responseBody: '{"sbi":"123456789","info":{"name":"Farm"}}'
        }
      }
    })
    expect(mockPublish.mock.calls[0][0].audit.details).not.toHaveProperty('errorCodes')
    expect(mockPublish.mock.calls[1][0].audit.details.rootField).toBe('customer')
  })

  test('marks a root field with an authorisation failure as denied', async () => {
    await sendResponse([['business', { ...businessEntry, errorCodes: ['FORBIDDEN'] }]], { business: null })

    expect(mockPublish.mock.calls[0][0].audit).toMatchObject({
      status: 'denied',
      details: { responseBody: 'null', errorCodes: ['FORBIDDEN'] }
    })
  })

  test('records a null response body when there is no single result', async () => {
    await sendResponse([['business', businessEntry]], undefined, 'incremental')

    expect(mockPublish.mock.calls[0][0].audit.details.responseBody).toBe('null')
  })

  test.each([
    ['auditing is disabled', null],
    ['nothing was recorded', []]
  ])('publishes nothing when %s', async (_name, entries) => {
    await sendResponse(entries, {})

    expect(mockPublish).not.toHaveBeenCalled()
  })
})
