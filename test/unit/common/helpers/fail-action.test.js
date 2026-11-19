import { describe, test, expect, vi } from 'vitest'

const loggerWarn = vi.fn()

vi.mock('../../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ warn: (...args) => loggerWarn(...args) })
}))

const { failAction } = await import('../../../../src/common/helpers/fail-action.js')

describe('failAction', () => {
  test('logs the error type without its message and rethrows it', () => {
    const error = new Error('"sbi" with value "1000000001" fails to match the required pattern')

    expect(() => failAction({}, {}, error)).toThrow(error)
    expect(loggerWarn).toHaveBeenCalledWith({ error: { type: 'Error' } }, 'Request failed validation')
  })
})
