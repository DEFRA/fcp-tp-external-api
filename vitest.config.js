import { defineConfig, configDefaults } from 'vitest/config'

const sharedEnv = {
  NODE_ENV: 'test',
  DAL_ENDPOINT: 'http://localhost:3000/graphql',
  DAL_TENANT_ID: 'test-tenant-id',
  DAL_TOKEN_ENDPOINT: 'https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/token',
  DAL_CLIENT_ID: 'test-client-id',
  DAL_CLIENT_SECRET: 'test-client-secret',
  SANITIZE_DATA: 'true',
  SANITIZE_SECRET: 'test-sanitize-secret'
}

const coverageConfig = {
  provider: 'v8',
  reportsDirectory: './coverage',
  clean: false,
  reporter: ['text', 'lcov'],
  include: ['src/**/*.js'],
  exclude: [...configDefaults.exclude, 'coverage', '**/test/**']
}

export default defineConfig({
  test: {
    globals: true,
    clearMocks: true,
    coverage: coverageConfig,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.js'],
          clearMocks: true,
          environment: 'node',
          env: sharedEnv
        }
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          clearMocks: true,
          environment: 'node',
          env: sharedEnv
        }
      }
    ]
  }
})
