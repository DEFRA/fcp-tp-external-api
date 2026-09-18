import { describe, test, expect, afterAll } from 'vitest'
import { apolloServer, start, stop } from '../../../src/graphql/server.js'

describe('graphql server', () => {
  afterAll(async () => {
    await stop()
  })

  test('starts the Apollo server', async () => {
    await start()

    expect(apolloServer.internals.state.phase).toBe('started')
  })

  test('is a no-op when already started', async () => {
    await start()

    expect(apolloServer.internals.state.phase).toBe('started')
  })

  test('stops the Apollo server', async () => {
    await stop()

    expect(apolloServer.internals.state.phase).not.toBe('started')
  })

  test('is a no-op when already stopped', async () => {
    await stop()

    expect(apolloServer.internals.state.phase).not.toBe('started')
  })
})
