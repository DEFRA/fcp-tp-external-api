import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

async function load () {
  vi.resetModules()
  await import('../../../../src/common/helpers/metrics-environment.js')
}

describe('metrics environment', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_EMF_ENVIRONMENT', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('sends metrics to stdout when not running on ECS, as with the published image run locally', async () => {
    vi.stubEnv('ECS_CONTAINER_METADATA_URI', undefined)

    await load()

    expect(process.env.AWS_EMF_ENVIRONMENT).toBe('Local')
  })

  test.each(['local', 'dev', 'prod'])('leaves CloudWatch on when running on ECS, whatever ENVIRONMENT is (%s)', async (environment) => {
    vi.stubEnv('ECS_CONTAINER_METADATA_URI', 'http://169.254.170.2/v3/a-task')
    vi.stubEnv('ENVIRONMENT', environment)

    await load()

    expect(process.env.AWS_EMF_ENVIRONMENT).toBeUndefined()
  })

  test('respects an explicit setting', async () => {
    vi.stubEnv('ECS_CONTAINER_METADATA_URI', undefined)
    vi.stubEnv('AWS_EMF_ENVIRONMENT', 'Agent')

    await load()

    expect(process.env.AWS_EMF_ENVIRONMENT).toBe('Agent')
  })
})
