# fcp-tp-external-api

GraphQL API that gives third parties outside Defra's ecosystem read access to farming business
and customer data.

The service is a thin, authenticated front to the
[Data Access Layer (DAL)](https://github.com/DEFRA/fcp-dal-api). A third party calls this API,
this service calls the DAL with its own Microsoft Entra machine-to-machine token, and the data
that comes back can optionally be substituted with realistic fake values before it is returned.

It is intended to be a temporary extension of `fcp-dal-api`. For now it is a client of the DAL,
in the same way `fcp-sfd-frontend` is.

- [Overview](#overview)
- [How it works](#how-it-works)
- [The GraphQL API](#the-graphql-api)
- [Sanitization](#sanitization)
- [Entra setup](#entra-setup)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Testing](#testing)
- [Debugging](#debugging)
- [Docker](#docker)
- [Deployment](#deployment)
- [Licence](#licence)

## Overview

| | |
| --- | --- |
| Runtime | Node.js 24, ES modules |
| Framework | Hapi 21 |
| API | Apollo Server 5 mounted on Hapi at `/graphql` |
| Port | 3001 |
| Upstream | `fcp-dal-api` (GraphQL) |
| Auth (inbound) | None. The API gateway in front of this service handles it |
| Auth (outbound) | Entra client credentials, cached in memory |
| Linting | neostandard |
| Testing | Vitest |
| Platform | Defra CDP |

### Dependencies

The service needs a reachable `fcp-dal-api` and a set of Entra credentials. Nothing else: there is
no database, and the token cache is in process memory. For local development `compose.yml` brings
up the DAL and everything it needs.

## How it works

```
Third party ──▶ API gateway ──▶ fcp-tp-external-api ──▶ fcp-dal-api ──▶ KITS / Hitachi
                                       │
                                  sanitization
```

A request flows through these layers:

| Layer | Directory | Responsibility |
| --- | --- | --- |
| Schema | `src/graphql/types/` | SDL describing the API surface |
| Resolvers | `src/graphql/resolvers/` | Validate arguments, delegate to a service |
| Services | `src/services/` | Build the DAL query, unwrap the response |
| DAL connector | `src/dal/` | Authenticated GraphQL calls to `fcp-dal-api` |
| Mappers | `src/mappers/` | Shape DAL responses into the API's own types |
| Sanitizer | `src/sanitizer/` | Substitute business and personal data |

Resolvers stay thin. Each one validates its identifier and hands off to a service, so business
logic never leaks into the GraphQL layer.

### Inbound requests

This service does **not** authenticate its callers. The API gateway sitting in front of it in
every deployed environment does that. What the service does care about is the caller's Defra ID
token: it is read from `x-forwarded-authorization` (falling back to `authorization`) and passed
straight through to the DAL as `x-forwarded-authorization`, so the DAL can apply the end user's
own permissions. The service never inspects or validates it.

### Outbound requests to the DAL

Every DAL call carries two tokens:

- `Authorization` — this service's own Entra machine-to-machine token, identifying the service.
- `x-forwarded-authorization` — the caller's Defra ID token, identifying the end user.

It also sends `gateway-type: external`, telling the DAL to route through the external KITS
gateway.

### Entra token handling

Mirrors the approach `fcp-sfd-frontend` uses.

- **Caching.** Tokens are held in an in-memory [catbox](https://hapi.dev/module/catbox/) cache
  (`src/common/helpers/caching/token-cache.js`) under a single key. The TTL is the token's own
  lifetime minus a 60 second buffer, so a token is never used in the moments before it expires.
- **Retries.** Token requests are wrapped in `retry()`
  (`src/services/dal/token/retry-service.js`): three retries with exponential backoff, starting
  at one second. If a request comes back `401` the cached token is dropped first, so the retry
  fetches a fresh one rather than replaying a token the identity provider has already rejected.

Because the cache is in process memory, each running instance holds its own token. That is
deliberate: tokens are cheap to obtain and this avoids needing a shared cache.

## The GraphQL API

The endpoint is `POST /graphql`. Introspection is enabled outside production, so the easiest way
to explore the schema is to point a GraphQL client at it.

There are three query paths.

**A business by SBI**

```graphql
query Business($sbi: ID!) {
  business(sbi: $sbi) {
    organisationId
    sbi
    info {
      name
      vat
      traderNumber
      vendorNumber
      legalStatus { code type }
      type { code type }
      address { line1 line2 city county postalCode country uprn }
      email { address }
      phone { mobile landline }
    }
    countyParishHoldings { cphNumber }
  }
}
```

**A customer by CRN**

```graphql
query Customer($crn: ID!) {
  customer(crn: $crn) {
    crn
    info {
      name { first middle last }
      dateOfBirth
      address { line1 city postalCode }
      email { address }
      phone { mobile landline }
    }
  }
}
```

**The permissions a customer holds for a business**

```graphql
query Permissions($sbi: ID!, $crn: ID!) {
  business(sbi: $sbi) {
    sbi
    customer(crn: $crn) {
      crn
      permissionGroups { id level }
    }
  }
}
```

Identifiers are validated before any call is made upstream. An SBI must be nine digits and a CRN
ten, neither starting with zero. Invalid input returns a `BAD_USER_INPUT` error without touching
the DAL.

### Errors

Failures upstream surface as GraphQL errors with a code in `extensions.code`:

| Code | Meaning |
| --- | --- |
| `BAD_USER_INPUT` | The SBI or CRN was not a valid identifier |
| `DAL_UNAVAILABLE` | The DAL could not be reached, or the request timed out |
| `DAL_REQUEST_REJECTED` | The DAL returned a non-success status. `extensions.status` has it |
| *(passed through)* | The DAL returned a GraphQL error; its own code is preserved |

### Health

`GET /health` returns `{ "message": "success" }`. CDP uses it as the container health check.

## Sanitization

Third parties integrating against this API generally need data that *looks* real without *being*
real. When `SANITIZE_DATA` is enabled, every business and personal data field is replaced with a
plausible fake before the response leaves the service. The approach is the same as the
`sanitizer` service.

### How it works

Substitution is deterministic, not random:

1. The original value, the field it came from, and `SANITIZE_SECRET` are combined into an
   HMAC-SHA256 digest (`src/sanitizer/hash.js`).
2. That digest seeds a generator appropriate to the field: a first name generator for
   `CustomerName.first`, a postcode generator for `Address.postalCode`, and so on
   (`src/sanitizer/generators.js`).

This gives three useful properties:

- **Stable.** The same real value always becomes the same fake value, so a third party can build
  against the data and it will not shift underneath them between requests or deployments.
- **Consistent across entities.** A business and a customer sharing an address get the same fake
  address, so relationships in the data survive.
- **Not reversible, and not comparable across environments.** Changing `SANITIZE_SECRET` produces
  entirely different output, so fake values from one environment reveal nothing about another.

Including the field name in the digest means the same value appearing in two different fields
gets two different substitutions, which stops anyone inferring which fields originally matched.

### What is and is not substituted

Which fields are substituted is declared per type in `src/sanitizer/rules.js`.

**Substituted:** business name, VAT number, all address fields (including UPRN), email addresses,
phone numbers, customer names, and date of birth.

**Preserved:** identifiers and reference data, because they are what make the response usable.
That means SBI, CRN, organisation ID, trader number, vendor number, CPH number, permission group
IDs and levels, and legal status and business type codes.

A field with no rule is left untouched. A field whose rule names a generator that does not exist
becomes `[REDACTED]` rather than leaking the original, so a mistake in the rules fails safe.

### Configuring it

`SANITIZE_DATA` defaults to `true`. It should only ever be turned off where the caller is
genuinely entitled to real data. When sanitization is enabled, `SANITIZE_SECRET` must be set;
the service throws rather than returning unsanitized data if it is missing.

Keep `SANITIZE_SECRET` stable within an environment. Rotating it changes every fake value the
API has ever returned.

## Entra setup

The service authenticates to the DAL with the OAuth 2.0 client credentials grant. You need an app
registration in the same Entra tenant as the DAL.

1. **Register the application.** In the Entra portal, create an app registration for
   `fcp-tp-external-api`. Note the *Application (client) ID* and *Directory (tenant) ID*.
2. **Create a client secret.** Under *Certificates & secrets*, add a client secret and record its
   value. It is shown once.
3. **Grant access to the DAL.** The DAL must accept this service as a caller. Depending on how
   the DAL's app registration is set up, that is either an app role assigned to this service's
   service principal, or membership of the AD group the DAL checks.
4. **Configure the service.** Set `DAL_TENANT_ID`, `DAL_CLIENT_ID`, `DAL_CLIENT_SECRET` and
   `DAL_TOKEN_ENDPOINT`. The token endpoint follows the standard form:

   ```
   https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token
   ```

   The scope requested is `<client-id>/.default`, derived from `DAL_CLIENT_ID`.

In deployed environments the client secret is supplied through CDP secrets, never committed.

Client secrets expire. A federated credential (workload identity) would remove that maintenance
burden and is the intended direction, but a client secret is used for now.

Locally none of this matters: the DAL container runs with `DISABLE_AUTH=true` and does not check
our token at all, so set `DAL_DISABLE_AUTH=true` (the `.env.example` default) to skip fetching one
from Entra entirely. A placeholder bearer token is sent instead.

## Local development

### Prerequisites

- Node.js 24 (`nvm use` picks it up from `.nvmrc`)
- Docker

### Running

The service runs host-native for fast reloads, with its dependencies in Docker.

```bash
nvm use
npm install
cp .env.example .env
npm run local
```

`npm run local` starts the dependency containers, waits for them to become healthy, then runs the
service with file watching. The API is on <http://localhost:3001/graphql>.

Or run the two steps separately:

```bash
npm run services:up     # Start the DAL and its dependencies
npm run dev             # Run the service with hot reload
npm run services:down   # Stop the dependency containers
```

### What `compose.yml` starts

| Service | Port | Purpose |
| --- | --- | --- |
| `fcp-dal-api` | 3005 (3000 in-container) | The DAL this service calls |
| `upstream-mock` | 3100 | Stubs the KITS and Hitachi services the DAL calls |
| `mongodb` | 27017 | The DAL's database |
| `fcp-tp-external-api` | 3001 | This service. Only under the `app` profile |

Published images are used for the DAL and its mock, so nothing needs building or cloning. The DAL
runs with `DISABLE_AUTH=true` and `DISABLE_PROXY=true`, and this service runs with
`DAL_DISABLE_AUTH=true`, so no real Entra credentials are needed locally.

To run this service in Docker too, rather than host-native:

```bash
npm run docker:build
npm run docker:dev
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Configuration

Configuration is [convict](https://github.com/mozilla/node-convict) based and validated strictly
at startup: an unrecognised or missing mandatory value stops the service rather than letting it
run misconfigured. See `src/config.js`, and `.env.example` for a working local set.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | | `3001` | Port to bind |
| `HOST` | | `0.0.0.0` | Address to bind |
| `NODE_ENV` | | | `production` switches on ECS logging, secure context and metrics |
| `ENVIRONMENT` | | `local` | The CDP environment |
| `SERVICE_VERSION` | | | Injected by CDP |
| `DAL_ENDPOINT` | yes | | GraphQL endpoint of the DAL |
| `DAL_GATEWAY_TYPE` | | `external` | DAL gateway to route through. `external` or `internal` |
| `DAL_REQUEST_TIMEOUT_MS` | | `15000` | Timeout on outbound DAL requests |
| `DAL_TENANT_ID` | yes | | Entra tenant ID |
| `DAL_TOKEN_ENDPOINT` | yes | | Entra token endpoint |
| `DAL_CLIENT_ID` | yes | | Entra client ID of this service |
| `DAL_CLIENT_SECRET` | yes | | Entra client secret of this service |
| `SANITIZE_DATA` | | `true` | Substitute business and personal data before responding |
| `SANITIZE_SECRET` | yes, when sanitizing | | Secret keying the substitution |
| `GRAPHQL_PATH` | | `/graphql` | Path the API is served from |
| `GRAPHQL_INTROSPECTION_ENABLED` | | off in production | Allow schema introspection |
| `LOG_LEVEL` | | `info` | Logging level |
| `LOG_FORMAT` | | `ecs` in production | `ecs` or `pino-pretty` |
| `HTTP_PROXY` | | | Set by CDP. Routes outbound traffic through the platform proxy |
| `ENABLE_SECURE_CONTEXT` | | on in production | Load CDP's CA certificates |
| `ENABLE_METRICS` | | on in production | Report CloudWatch metrics |
| `TRACING_HEADER` | | `x-cdp-request-id` | Header carrying the CDP trace ID |

## Testing

```bash
npm test                  # Everything, with coverage
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:watch        # Watch mode
```

Tests need no containers. Unit tests in `test/unit/` mirror the `src/` structure. Integration
tests in `test/integration/narrow/` boot a real Hapi server and drive it with `server.inject()`,
stubbing only the outbound DAL call, which covers the full resolver, service, connector, mapper
and sanitizer path.

## Debugging

VS Code launch configurations are in `.vscode/launch.json`:

- **Dev: run server** — runs the service with the inspector attached. Run `npm run services:up`
  first.
- **Debug current test** — opens the inspector on the active test file. Open a test and press F5.

To debug the service inside Docker, run `npm run docker:dev` and attach to port 9001.

## Docker

The `Dockerfile` is multi-stage and built on the CDP Node parent image. The `development` stage
is what `compose.yml` uses; the production stage installs production dependencies only, makes the
application directory read-only and runs as the unprivileged `node` user.

```bash
docker build --target development --tag fcp-tp-external-api:dev .
docker build --tag fcp-tp-external-api .
```

## Deployment

Deployed on [Defra CDP](https://portal.cdp-int.defra.cloud/). Merging to `main` triggers
`.github/workflows/publish.yml`, which lints, tests, scans with SonarQube, then builds and
publishes the container image. Pull requests run the same checks plus a dependency review through
`.github/workflows/check-pull-request.yml`.

Include `#patch` or `#major` in a commit message to control the version bump; the minor version
is bumped by default.

This service follows the
[Defra software development standards](https://defra.github.io/software-development-standards/).

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:
<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using
this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery
Office (HMSO) to enable information providers in the public sector to license the use and
re-use of their information under a common open licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few
conditions.
