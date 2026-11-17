import { SNSClient } from '@aws-sdk/client-sns'
import { publishAuditEvent } from '@defra/fcp-audit-publisher'
import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const APPLICATION = 'FAL Third Party API'

const logger = createLogger()

let snsClient

function environmentName () {
  const environment = config.get('cdpEnvironment')
  return environment === 'local' ? 'local' : `cdp-${environment}`
}

// Never throws: a lost audit event is logged rather than failing the caller's request
export async function publish (event) {
  try {
    // Region, endpoint and credentials come from the AWS_* environment variables
    snsClient ??= new SNSClient()

    await publishAuditEvent(event, {
      snsClient,
      sns: { topicArn: config.get('audit.snsTopicArn') },
      application: APPLICATION,
      component: config.get('serviceName'),
      environment: environmentName()
    })
  } catch (err) {
    // The event holds personal data, so it is never logged. Schema errors name fields, not values.
    logger.error({ error: { type: err.name, message: err.message } }, 'Audit event could not be published')
  }
}
