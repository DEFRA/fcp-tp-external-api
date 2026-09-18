import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../../src/server.js'
import { stop as stopApolloServer } from '../../../src/graphql/server.js'

let server

beforeAll(async () => {
  server = await createServer()
  await server.initialize()
})

afterAll(async () => {
  await server.stop({ timeout: 0 })
  await stopApolloServer()
})

describe('GET /health', () => {
  test('reports that the service is up', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({ message: 'success' })
  })
})

describe('GET /graphql', () => {
  test('rejects a request for an operation that does not exist', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: '{ notAQuery }' }
    })

    expect(JSON.parse(response.payload).errors[0].extensions.code).toBe(
      'GRAPHQL_VALIDATION_FAILED'
    )
  })
})
