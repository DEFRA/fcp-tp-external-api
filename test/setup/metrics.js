import { vi } from 'vitest'

// Keeps EMF documents out of the test output. Tests assert against this mock instead.
vi.mock('../../src/common/helpers/metrics.js', () => ({
  serverMetrics: { counter: vi.fn(), millis: vi.fn() }
}))
