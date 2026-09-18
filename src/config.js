import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'fcp-tp-external-api'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isDevelopment: {
    doc: 'Is the service running in development mode',
    format: Boolean,
    default: !isProduction
  },
  isSecureContextEnabled: {
    doc: 'Enable custom secure context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  graphql: {
    path: {
      doc: 'Path the GraphQL endpoint is served from',
      format: String,
      default: '/graphql',
      env: 'GRAPHQL_PATH'
    },
    isIntrospectionEnabled: {
      doc: 'Allow clients to introspect the schema',
      format: Boolean,
      default: !isProduction,
      env: 'GRAPHQL_INTROSPECTION_ENABLED'
    }
  },
  dal: {
    endpoint: {
      doc: 'GraphQL endpoint of the data access layer (DAL)',
      format: String,
      default: null,
      env: 'DAL_ENDPOINT'
    },
    gatewayType: {
      doc: 'Which DAL gateway to route requests through',
      format: ['external', 'internal'],
      default: 'external',
      env: 'DAL_GATEWAY_TYPE'
    },
    requestTimeoutMs: {
      doc: 'Timeout applied to outbound DAL requests',
      format: 'nat',
      default: 15000,
      env: 'DAL_REQUEST_TIMEOUT_MS'
    },
    tenantId: {
      doc: 'Unique ID of the Entra tenant issuing our machine-to-machine token',
      format: String,
      default: null,
      env: 'DAL_TENANT_ID'
    },
    tokenEndpoint: {
      doc: 'Entra token endpoint used to obtain a machine-to-machine token',
      format: String,
      default: null,
      env: 'DAL_TOKEN_ENDPOINT'
    },
    clientId: {
      doc: 'Entra client ID of this service',
      format: String,
      default: null,
      env: 'DAL_CLIENT_ID'
    },
    clientSecret: {
      doc: 'Entra client secret of this service',
      format: String,
      default: null,
      env: 'DAL_CLIENT_SECRET',
      sensitive: true
    }
  },
  sanitize: {
    isEnabled: {
      doc: 'Substitute business and personal data with fake values before responding',
      format: Boolean,
      default: true,
      env: 'SANITIZE_DATA'
    },
    secret: {
      doc: 'Secret keying the HMAC that makes substituted values deterministic',
      format: String,
      nullable: true,
      default: null,
      env: 'SANITIZE_SECRET',
      sensitive: true
    }
  }
})

config.validate({ allowed: 'strict' })
