import { describe, test, expect, vi } from 'vitest'

const loggerWarn = vi.fn()

vi.mock('../../../../src/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ warn: (...args) => loggerWarn(...args) })
}))

const { failAction } = await import('../../../../src/common/helpers/fail-action.js')

describe('failAction', () => {
  test('logs and rethrows the validation error', () => {
    const error = new Error('"sbi" is required')

    expect(() => failAction({}, {}, error)).toThrow('"sbi" is required')
    expect(loggerWarn).toHaveBeenCalledWith(error, error.message)
  })
})
