import { describe, test, expect, vi, afterEach } from 'vitest'
import { config } from '../../../src/config.js'

const mockPublishAuditEvent = vi.hoisted(() => vi.fn())
const mockSnsClient = vi.hoisted(() => vi.fn(function () { this.isMockClient = true }))
const mockLogger = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('@defra/fcp-audit-publisher', () => ({
  publishAuditEvent: mockPublishAuditEvent
}))

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: mockSnsClient
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

describe('SNS client', () => {
  // The client is created once per module, so each case needs a fresh import
  async function publishWithAws (aws) {
    vi.resetModules()
    const { config: freshConfig } = await import('../../../src/config.js')
    for (const [key, value] of Object.entries(aws)) {
      freshConfig.set(`aws.${key}`, value)
    }
    const { publish: freshPublish } = await import('../../../src/audit/publish.js')
    await freshPublish(event)
    return freshPublish
  }

  test('defaults to eu-west-2 with no endpoint or keys, so the IAM role is used', async () => {
    await publishWithAws({})

    expect(mockSnsClient).toHaveBeenCalledWith({ region: 'eu-west-2' })
  })

  test('uses the endpoint and keys for a local emulator', async () => {
    await publishWithAws({
      region: 'eu-west-1',
      endpoint: 'http://localhost:4566',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    })

    expect(mockSnsClient).toHaveBeenCalledWith({
      region: 'eu-west-1',
      endpoint: 'http://localhost:4566',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
    })
  })

  test('is created once and reused', async () => {
    const freshPublish = await publishWithAws({})
    await freshPublish(event)

    expect(mockSnsClient).toHaveBeenCalledTimes(1)
  })
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
