import { buildAuditEvent } from './event.js'
import { publish } from './publish.js'

// fcp-audit lowercases every key it receives, so nested data is sent as JSON strings to keep its shape
function toAudit (key, entry, data) {
  return {
    entities: entry.entities,
    accounts: entry.accounts,
    status: entry.errorCodes.length ? 'denied' : 'success',
    details: {
      rootField: key,
      arguments: JSON.stringify(entry.arguments),
      responseBody: JSON.stringify(data?.[key] ?? null),
      ...(entry.errorCodes.length && { errorCodes: entry.errorCodes })
    }
  }
}

// Publishes one event per audited root field, with the data actually returned for it
export const auditPlugin = {
  async requestDidStart () {
    return {
      async willSendResponse ({ contextValue, response }) {
        const { request, entries } = contextValue.audit ?? {}
        if (!entries?.size) {
          return
        }

        const data = response.body.kind === 'single' ? response.body.singleResult.data : undefined

        await Promise.all(
          [...entries].map(([key, entry]) => publish(buildAuditEvent(request, toAudit(key, entry, data))))
        )
      }
    }
  }
}
