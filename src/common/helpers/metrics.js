import './metrics-environment.js'
import { Metrics } from '@defra/cdp-metrics'
import { createLogger } from './logging/logger.js'

// Calls are not awaited: cdp-metrics never rejects, it logs a warning instead
export const serverMetrics = new Metrics(createLogger())
