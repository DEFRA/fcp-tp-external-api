import { constants } from 'node:http2'

const { HTTP_STATUS_UNAUTHORIZED, HTTP_STATUS_FORBIDDEN } = constants

const AUTH_ERROR_CODES = new Set(['UNAUTHORIZED', 'UNAUTHENTICATED', 'FORBIDDEN'])
const AUTH_ERROR_STATUSES = new Set([HTTP_STATUS_UNAUTHORIZED, HTTP_STATUS_FORBIDDEN])

function authErrorCode (error) {
  const { code, status, dalCode } = error?.extensions ?? {}

  if (AUTH_ERROR_CODES.has(code)) {
    return code
  }

  if (code === 'DAL_REQUEST_REJECTED' && AUTH_ERROR_STATUSES.has(status)) {
    return dalCode ?? code
  }

  return null
}

function rootKey (info) {
  let segment = info.path
  while (segment.prev) {
    segment = segment.prev
  }
  return segment.key
}

function record (entries, info, args, { entity, action, entityid, accounts }, errorCode) {
  const key = rootKey(info)
  const entry = entries.get(key) ?? { entities: [], accounts: {}, errorCodes: [] }
  entries.set(key, entry)

  if (!info.path.prev) {
    entry.arguments = args
  }

  entry.entities.push({ entity, action, entityid })

  for (const [name, value] of Object.entries(accounts)) {
    if (value != null) {
      entry.accounts[name] = String(value)
    }
  }

  if (errorCode) {
    entry.errorCodes.push(errorCode)
  }
}

// Records what a resolver read or changed against its root field, for successes and authorisation failures only
export function audited (describe, resolver) {
  return async (parent, args, context, info) => {
    if (!context.audit) {
      return resolver(parent, args, context, info)
    }

    try {
      const result = await resolver(parent, args, context, info)
      record(context.audit.entries, info, args, describe(parent, args, result))
      return result
    } catch (error) {
      const errorCode = authErrorCode(error)
      if (errorCode) {
        record(context.audit.entries, info, args, describe(parent, args), errorCode)
      }
      throw error
    }
  }
}
