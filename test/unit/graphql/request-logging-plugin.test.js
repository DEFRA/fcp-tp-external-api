import { describe, test, expect, vi } from 'vitest'
import { constants } from 'node:http2'
import { GraphQLError, getOperationAST, parse } from 'graphql'

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

vi.mock('../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => mockLogger
}))

const { requestLoggingPlugin } = await import('../../../src/graphql/request-logging-plugin.js')
const { serverMetrics } = await import('../../../src/common/helpers/metrics.js')

const CLIENT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const CRN = '1000000001'

function jwt (payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`
}

function operationOf (query) {
  return getOperationAST(parse(query))
}

async function run ({ operation, errors, forwardedUserToken } = {}) {
  const listener = await requestLoggingPlugin.requestDidStart()
  await listener.willSendResponse({ operation, errors, contextValue: { forwardedUserToken } })
}

function graphqlError (code, { path, extensions = {}, originalError } = {}) {
  return new GraphQLError('message', {
    path,
    originalError,
    extensions: code ? { code, ...extensions } : extensions
  })
}

function counterCalls (name) {
  return serverMetrics.counter.mock.calls.filter(([metric]) => metric === name)
}

describe('requestLoggingPlugin', () => {
  test('logs a successful request at info with its root field, type, outcome and duration', async () => {
    await run({ operation: operationOf('query { business(sbi: "123456789") { sbi } }') })

    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        event: {
          category: 'graphql',
          type: 'query',
          action: 'business',
          outcome: 'success',
          reason: undefined,
          duration: expect.any(Number)
        }
      },
      expect.stringMatching(/^GraphQL query business succeeded in \d+ms$/)
    )
    expect(serverMetrics.counter).toHaveBeenCalledWith('GraphQLRequests')
    expect(serverMetrics.counter).toHaveBeenCalledWith('OperationRequests', 1, { Operation: 'business', Outcome: 'success' })
    expect(counterCalls('GraphQLClientErrors')).toHaveLength(0)
    expect(counterCalls('GraphQLServerErrors')).toHaveLength(0)
  })

  test('names every root field, using the field rather than any alias', async () => {
    await run({ operation: operationOf('query { b: business(sbi: "1") { sbi } customer(crn: "2") { crn } }') })

    expect(mockLogger.info.mock.calls[0][0].event.action).toBe('business,customer')
  })

  test('labels a mutation', async () => {
    await run({ operation: operationOf('mutation { updateCustomerAllFields(input: {}) { success } }') })

    expect(mockLogger.info.mock.calls[0][0].event).toMatchObject({ type: 'mutation', action: 'updateCustomerAllFields' })
  })

  test('labels an operation with only introspection fields', async () => {
    await run({ operation: operationOf('{ __typename }') })

    expect(mockLogger.info.mock.calls[0][0].event.action).toBe('introspection')
    expect(counterCalls('OperationRequests')).toHaveLength(0)
  })

  test('attributes the request to the third party named in the token', async () => {
    await run({
      operation: operationOf('{ customer(crn: "1") { crn } }'),
      forwardedUserToken: `Bearer ${jwt({ contactId: CRN, azp: CLIENT_ID })}`
    })

    expect(mockLogger.info.mock.calls[0][0].tenant).toEqual({ id: CLIENT_ID })
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(CRN)
  })

  test('logs a client error at warn with its code and counts it', async () => {
    await run({
      operation: operationOf('{ business(sbi: "1") { sbi } }'),
      errors: [graphqlError('BAD_USER_INPUT', { path: ['business'] })]
    })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        event: expect.objectContaining({ action: 'business', outcome: 'failure', reason: 'BAD_USER_INPUT' }),
        error: { code: 'BAD_USER_INPUT' }
      },
      expect.stringMatching(/^GraphQL query business failed in \d+ms$/)
    )
    expect(serverMetrics.counter).toHaveBeenCalledWith('GraphQLClientErrors')
    expect(serverMetrics.counter).toHaveBeenCalledWith('GraphQLErrors', 1, { ErrorCode: 'BAD_USER_INPUT' })
    expect(serverMetrics.counter).toHaveBeenCalledWith('OperationRequests', 1, { Operation: 'business', Outcome: 'failure' })
  })

  test.each([
    ['DAL_UNAVAILABLE', {}],
    ['DAL_ERROR', {}],
    ['BAD GATEWAY', {}],
    ['DAL_REQUEST_REJECTED', { status: constants.HTTP_STATUS_SERVICE_UNAVAILABLE }]
  ])('logs %s at error and counts it as a server error', async (code, extensions) => {
    await run({
      operation: operationOf('{ business(sbi: "1") { sbi } }'),
      errors: [graphqlError(code, { path: ['business'], extensions })]
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: { code } }),
      expect.any(String)
    )
    expect(serverMetrics.counter).toHaveBeenCalledWith('GraphQLServerErrors')
    expect(counterCalls('GraphQLClientErrors')).toHaveLength(0)
  })

  test('treats a DAL rejection with a 4xx status as a client error', async () => {
    await run({
      operation: operationOf('{ business(sbi: "1") { sbi } }'),
      errors: [graphqlError('DAL_REQUEST_REJECTED', { path: ['business'], extensions: { status: constants.HTTP_STATUS_FORBIDDEN } })]
    })

    expect(mockLogger.warn).toHaveBeenCalled()
    expect(serverMetrics.counter).toHaveBeenCalledWith('GraphQLClientErrors')
  })

  test('only marks the root fields that failed', async () => {
    await run({
      operation: operationOf('{ business(sbi: "1") { sbi } c: customer(crn: "2") { crn } }'),
      errors: [graphqlError('NOT FOUND', { path: ['c'] })]
    })

    expect(serverMetrics.counter).toHaveBeenCalledWith('OperationRequests', 1, { Operation: 'business', Outcome: 'success' })
    expect(serverMetrics.counter).toHaveBeenCalledWith('OperationRequests', 1, { Operation: 'customer', Outcome: 'failure' })
  })

  test('marks every root field failed when an error has no path', async () => {
    await run({
      operation: operationOf('{ business(sbi: "1") { sbi } customer(crn: "2") { crn } }'),
      errors: [graphqlError('BAD_REQUEST')]
    })

    expect(counterCalls('OperationRequests').map(([, , dims]) => dims.Outcome)).toEqual(['failure', 'failure'])
  })

  test('never logs the caller\'s field names, error messages or values before the operation is validated', async () => {
    const error = new GraphQLError(`Cannot query field "crn${CRN}" on type "Query".`, {
      extensions: { code: 'GRAPHQL_VALIDATION_FAILED' }
    })

    await run({ errors: [error] })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        event: expect.objectContaining({ type: undefined, action: 'unknown', reason: 'GRAPHQL_VALIDATION_FAILED' }),
        error: { code: 'GRAPHQL_VALIDATION_FAILED' }
      },
      expect.stringMatching(/^GraphQL request unknown failed in \d+ms$/)
    )
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain(CRN)
    expect(counterCalls('OperationRequests')).toHaveLength(0)
  })

  test('replaces a code that is not a plain constant with OTHER', async () => {
    await run({ errors: [graphqlError('some code with "data" in it')] })

    expect(serverMetrics.counter).toHaveBeenCalledWith('GraphQLErrors', 1, { ErrorCode: 'OTHER' })
  })

  test('logs an unexpected error with its stack but not its message, and counts it', async () => {
    const original = new SyntaxError(`Unexpected token in JSON: "${CRN}"`)

    await run({
      operation: operationOf('{ business(sbi: "1") { sbi } }'),
      errors: [graphqlError(undefined, { path: ['business'], originalError: original })]
    })

    const unexpected = mockLogger.error.mock.calls.find(([, message]) => message === 'Unexpected error while resolving a GraphQL request')
    expect(unexpected[0]).toEqual({
      event: { category: 'graphql', outcome: 'failure' },
      error: { type: 'SyntaxError', code: 'INTERNAL_SERVER_ERROR', stack_trace: expect.stringMatching(/^SyntaxError\n\s+at /) }
    })
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(CRN)
    expect(serverMetrics.counter).toHaveBeenCalledWith('UnexpectedErrors')
    expect(serverMetrics.counter).toHaveBeenCalledWith('GraphQLServerErrors')
  })

  test('omits the stack of an unexpected error when it does not start with the message', async () => {
    const original = new Error('boom')
    original.stack = 'custom stack'

    await run({ errors: [graphqlError(undefined, { originalError: original })] })

    const unexpected = mockLogger.error.mock.calls.find(([, message]) => message === 'Unexpected error while resolving a GraphQL request')
    expect(unexpected[0].error.stack_trace).toBeUndefined()
  })

  test('logs an unexpected error without an original error', async () => {
    await run({ errors: [graphqlError(undefined)] })

    expect(serverMetrics.counter).toHaveBeenCalledWith('UnexpectedErrors')
  })
})
