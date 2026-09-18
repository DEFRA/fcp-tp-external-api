import { describe, vi, beforeAll, afterAll, test, expect } from 'vitest'
import Hapi from '@hapi/hapi'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()

const mockHapiLoggerInfo = vi.fn()

vi.mock('hapi-pino', () => ({
  default: {
    register: (server) => {
      server.decorate('server', 'logger', {
        info: mockHapiLoggerInfo,
        error: vi.fn(),
        warn: vi.fn()
      })
    },
    name: 'mock-hapi-pino'
  }
}))

vi.mock('../../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  })
}))

describe('startServer', () => {
  const PROCESS_ENV = process.env
  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport

  beforeAll(async () => {
    process.env = { ...PROCESS_ENV, PORT: '3098' } // Obscure port to avoid conflicts

    createServerImport = await import('../../../../src/server.js')
    startServerImport = await import('../../../../src/common/helpers/start-server.js')

    createServerSpy = vi.spyOn(createServerImport, 'createServer')
    hapiServerSpy = vi.spyOn(Hapi, 'server')
  })

  afterAll(() => {
    process.env = PROCESS_ENV
  })

  describe('when the server starts', () => {
    let server

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('starts up as expected', async () => {
      server = await startServerImport.startServer()

      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('Server started successfully')
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining('Access the GraphQL API on http://localhost:3098')
      )
    })
  })

  describe('when the server fails to start', () => {
    test('logs the failure', async () => {
      createServerSpy.mockRejectedValueOnce(new Error('Server failed to start'))

      await startServerImport.startServer()

      expect(mockLoggerInfo).toHaveBeenCalledWith('Server failed to start')
      expect(mockLoggerError).toHaveBeenCalledWith(new Error('Server failed to start'))
    })
  })
})
