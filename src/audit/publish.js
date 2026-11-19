import { SNSClient } from '@aws-sdk/client-sns'
import { publishAuditEvent } from '@defra/fcp-audit-publisher'
import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { serverMetrics } from '../common/helpers/metrics.js'

const APPLICATION = 'FAL Third Party API'

const logger = createLogger()

let snsClient

function createSnsClient () {
  const { region, endpoint, accessKeyId, secretAccessKey } = config.get('aws')

  return new SNSClient({
    region,
    ...(endpoint && {
      endpoint,
      credentials: { accessKeyId, secretAccessKey }
    })
  })
}

function environmentName () {
  const environment = config.get('cdpEnvironment')
  return environment === 'local' ? 'local' : `cdp-${environment}`
}

// Never throws: a lost audit event is logged rather than failing the caller's request
export async function publish (event) {
  try {
    snsClient ??= createSnsClient()

    await publishAuditEvent(event, {
      snsClient,
      sns: { topicArn: config.get('audit.snsTopicArn') },
      application: APPLICATION,
      component: config.get('serviceName'),
      environment: environmentName()
    })
    serverMetrics.counter('AuditEventsPublished')
  } catch (err) {
    // The event holds personal data, so it is never logged. Schema errors name fields, not values.
    logger.error(
      { event: { action: 'audit-publish', outcome: 'failure' }, error: { type: err.name, message: err.message } },
      'Audit event could not be published'
    )
    serverMetrics.counter('AuditPublishFailures')
  }
}
