import { describe, test, expect, vi } from 'vitest'

vi.unmock('../../../../src/common/helpers/metrics.js')

const { Metrics } = await import('@defra/cdp-metrics')
const { serverMetrics } = await import('../../../../src/common/helpers/metrics.js')

describe('serverMetrics', () => {
  test('is a cdp-metrics instance shared by everything that reports metrics', () => {
    expect(serverMetrics).toBeInstanceOf(Metrics)
  })
})
