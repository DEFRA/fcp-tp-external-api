import { describe, test, expect, vi, afterEach } from 'vitest'
import { config } from '../../../src/config.js'

const mockPublishAuditEvent = vi.hoisted(() => vi.fn())
const mockLogger = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('@defra/fcp-audit-publisher', () => ({
  publishAuditEvent: mockPublishAuditEvent
}))

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn(function () { this.isMockClient = true })
}))

vi.mock('../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const { publish } = await import('../../../src/audit/publish.js')

const event = {
  correlationid: 'trace-1',
  user: 'IDM/1000000001',
  audit: { entities: [{ entity: 'person', action: 'read', entityid: '1000000001' }], details: { responseBody: '{"email":"someone@example.com"}' } }
}

afterEach(() => {
  config.set('cdpEnvironment', 'local')
  config.set('audit.snsTopicArn', null)
})

describe('publish', () => {
  test('publishes to the configured topic with this service\'s identity', async () => {
    config.set('audit.snsTopicArn', 'arn:aws:sns:eu-west-2:000000000000:audit')

    await publish(event)

    expect(mockPublishAuditEvent).toHaveBeenCalledWith(event, {
      snsClient: expect.objectContaining({ isMockClient: true }),
      sns: { topicArn: 'arn:aws:sns:eu-west-2:000000000000:audit' },
      application: 'FAL Third Party API',
      component: 'fcp-tp-external-api',
      environment: 'local'
    })
  })

  test.each([
    ['local', 'local'],
    ['dev', 'cdp-dev'],
    ['prod', 'cdp-prod']
  ])('names the %s environment %s', async (cdpEnvironment, expected) => {
    config.set('cdpEnvironment', cdpEnvironment)

    await publish(event)

    expect(mockPublishAuditEvent.mock.calls[0][1].environment).toBe(expected)
  })

  test('logs a failure without the event and does not throw', async () => {
    mockPublishAuditEvent.mockRejectedValueOnce(new Error('Invalid audit event: "ip" is not allowed to be empty'))

    await expect(publish(event)).resolves.toBeUndefined()

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: { type: 'Error', message: 'Invalid audit event: "ip" is not allowed to be empty' } },
      'Audit event could not be published'
    )
    const logged = JSON.stringify(mockLogger.error.mock.calls)
    expect(logged).not.toContain('1000000001')
    expect(logged).not.toContain('someone@example.com')
  })
})
