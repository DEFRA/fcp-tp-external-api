import { describe, test, expect, vi } from 'vitest'

const getTraceId = vi.fn()

vi.mock('@defra/hapi-tracing', () => ({
  getTraceId: (...args) => getTraceId(...args)
}))

const { loggerOptions } = await import('../../../../../src/common/helpers/logging/logger-options.js')

describe('loggerOptions.mixin', () => {
  test('adds the trace id when one is present', () => {
    getTraceId.mockReturnValue('a-trace-id')

    expect(loggerOptions.mixin()).toEqual({ trace: { id: 'a-trace-id' } })
  })

  test('omits trace when there is none', () => {
    getTraceId.mockReturnValue(undefined)

    expect(loggerOptions.mixin()).toEqual({})
  })
})
