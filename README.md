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
- [Addresses](#addresses)
- [Sanitization](#sanitization)
- [Echoing recent updates](#echoing-recent-updates)
- [Restricting access by CRN](#restricting-access-by-crn)
- [Auditing](#auditing)
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
| Runtime | Node.js 26, ES modules |
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
| Mappers | `src/mappers/` | Translate between DAL shapes and the API's own types |
| Sanitizer | `src/sanitizer/` | Substitute business and personal data |
| Audit | `src/audit/` | Publish FCP Audit events for what was read or changed |

Resolvers stay thin. Each one validates its identifier and hands off to a service, so business
logic never leaks into the GraphQL layer.

### Inbound requests

This service does **not** authenticate its callers. The API gateway sitting in front of it in
every deployed environment does that. What the service does care about is the caller's Defra ID
token: it is read from `x-forwarded-authorization` (falling back to `authorization`) and passed
straight through to the DAL as `x-forwarded-authorization`, so the DAL can apply the end user's
own permissions. The service never validates it. It only reads claims from it: the CRN, to
[restrict access to an allow-list of CRNs](#restricting-access-by-crn), and the CRN, session ID
and authorised party for [audit events](#auditing).

### Outbound requests to the DAL

Every DAL call carries two tokens:

- `Authorization` — this service's own Entra machine-to-machine token, identifying the service.
- `x-forwarded-authorization` — the caller's Defra ID token, identifying the end user.

It also sends `gateway-type: external`, telling the DAL to route through the external KITS
gateway, and the CDP trace ID as `x-cdp-request-id`, so the DAL's audit events share our
correlation ID. When a request arrives without one, which only happens locally, the service
generates it.

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
      address { line1 line2 line3 city county postalCode country uprn }
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
      address { line1 line2 line3 city county postalCode country uprn }
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
| `BAD_USER_INPUT` | The SBI or CRN was not a valid identifier, or an address field was blank or too long |
| `DAL_UNAVAILABLE` | The DAL could not be reached, or the request timed out |
| `DAL_REQUEST_REJECTED` | The DAL returned a non-success status. `extensions.status` has it |
| *(passed through)* | The DAL returned a GraphQL error; its own code is preserved |

### Health

`GET /health` returns `{ "message": "success" }`. CDP uses it as the container health check.

## Addresses

The DAL stores an address as one of two alternative sets of fields:

- **Chosen from a postcode lookup.** It has a UPRN and is held in Royal Mail PAF style fields:
  `pafOrganisationName`, `flatName`, `buildingName`, `buildingNumberRange`, `street`,
  `doubleDependentLocality`, `dependentLocality` and `county`.
- **Typed in manually.** It has no UPRN and is held in `line1` to `line5`, where `line4` is the
  county and `line5` is unused.

`city`, `postalCode` and `country` belong to both. On top of that, the DAL takes a business
address as a one-of (`withUprn` or `withoutUprn`) but a customer address as a flat input.

This API hides all of that. Callers read and write one shape, for customers and businesses alike:

| Field | Required on input | Notes |
| --- | --- | --- |
| `line1` | Yes | |
| `line2` | | |
| `line3` | | |
| `city` | Yes | |
| `county` | | |
| `postalCode` | Yes | |
| `country` | Yes | |
| `uprn` | | Set when the address was chosen from a postcode lookup |

The fields are in display order, so rendering an address is a matter of showing the non-null ones
top to bottom.

The translation lives in `src/mappers/address.js`. It follows the way Defra's own services read
and write the same data (`formatOriginalAddress`, `buildUprnAddress` and `buildManualAddress` in
[fcp-sfd-frontend-engine](https://github.com/DEFRA/fcp-sfd-frontend-engine)).

### Reading

An address is read from its lookup fields when it has a UPRN **and** at least one lookup field
has a value. Otherwise it is read from its lines. Some records have a UPRN but no lookup fields
(most of the DAL mock's do), and reading their lines shows the whole address rather than just
the town and postcode.

| API field | From lookup fields | From lines |
| --- | --- | --- |
| `line1` | `pafOrganisationName`, `flatName`, `buildingName`, joined with `, ` | `line1` |
| `line2` | `buildingNumberRange` and `street`, joined with a space | `line2` |
| `line3` | `doubleDependentLocality`, `dependentLocality`, joined with `, ` | `line3` |
| `county` | `county` | `line4` |
| `city`, `postalCode`, `country`, `uprn` | Same name | Same name |

Empty lines are then removed and the rest moved up, so `line1` always has a value if any line
does. Blank values come back as null, and `line5` is never returned.

### Writing

`updateCustomerAllFields` takes an `address`, and `updateBusinessAllFields` takes an `address`
and a `correspondenceAddress`. All three are an `AddressInput` in the shape above, and each one
replaces the whole stored address: leaving an optional field out clears it. Blank optional
fields are saved as null.

Before the DAL is called, an address is checked against the limits Rural Payments applies when
it saves one (`PartyAddress.java` and `PostCodeValidator.java` in Rural Payments' `capd-services`).
A blank required field, or one over its limit, is rejected with `BAD_USER_INPUT`. Otherwise
Rural Payments would reject the whole update and the caller would only see `DAL_REQUEST_REJECTED`.

| Field | Maximum length |
| --- | --- |
| `line1`, `line2`, `line3` | 240 |
| `city`, `county` | 60 |
| `country` | 100 |
| `postalCode` | 8, not counting spaces |
| `uprn` | 12 |

Send `uprn` only when the address was chosen from a postcode lookup and has not been edited
since. Leave it out for an address a user typed in, or changed after choosing it.

| API field | Saved to, without a UPRN | Saved to, with a UPRN |
| --- | --- | --- |
| `line1` | `line1` | `buildingName` |
| `line2` | `line2` | `street` |
| `line3` | `line3` | `dependentLocality` |
| `county` | `line4` | `county` |
| `city`, `postalCode`, `country` | Same name | Same name |
| `uprn` | null | `uprn` |

Every other DAL address field is sent as null, so nothing from the previous address survives.
A business address is then wrapped in `withUprn` or `withoutUprn` to match. An address reads back
exactly as it was written, except that any gaps between lines are closed up.

```graphql
mutation UpdateCustomerAllFields($input: UpdateCustomerAllFieldsInput!) {
  updateCustomerAllFields(input: $input) {
    success
  }
}
```

```json
{
  "input": {
    "crn": "1234567890",
    "address": {
      "line1": "Oakwood House",
      "line2": "14 Oakwood Drive",
      "city": "Sheffield",
      "county": "South Yorkshire",
      "postalCode": "S10 2GH",
      "country": "United Kingdom"
    }
  }
}
```

### Trade-offs

- **Lookup structure is flattened.** A lookup address saved through this API keeps its UPRN but
  not its finer structure: an organisation, flat and building name all land in `buildingName`, a
  building number in `street` alongside the street name, and the localities in
  `dependentLocality`. This has been checked against the Rural Payments source:
  - **It passes validation.** With a UPRN, Rural Payments only requires the UPRN, and these
    fields are within its 240 character limit (see the limits above).
  - **It displays the same.** The Rural Payments portal (`capdAddressFormatter.js`) and Defra's
    own services both show a lookup address as organisation, flat, building, building number and
    street, then localities, so the address reads the same as the caller entered it.
  - **Duplicate matching is slightly weaker.** When Rural Payments finds a possible duplicate
    business it lists the fields that matched, including `street`
    (`OrganisationDuplicateHelper.java`). A street saved here includes the building number, so
    it won't match a genuine lookup's street. UPRN and postcode still match, and a manually
    entered address has no street at all.

  The checks used a snapshot of the Rural Payments code (Release 6), so anything changed since,
  or applied in the gateway between the DAL and Rural Payments, is not covered.
- **`line5` is dropped.** Defra's own services do not use it either.
- **The UPRN is trusted.** Neither this API nor Rural Payments checks that a UPRN matches the
  address sent with it. Both are stored as given.
- **Editing makes an address manual.** A lookup address that is edited and saved without its UPRN
  becomes a manual address, as it would in Defra's own services.

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

**Substituted:** VAT number, trader number, vendor number, CPH numbers, all address fields
(including UPRN), email addresses, phone numbers, customer names, and date of birth. Trader and
vendor numbers become six digits and CPH numbers keep the `CC/PPP/HHHH` shape. The DAL documents
the CPH format but defines none for trader and vendor numbers, so six digits is borrowed from the
mock's data.

**Preserved:** identifiers and reference data, because they are what make the response usable.
That means SBI, CRN, organisation ID, business name, permission group IDs and levels, and legal
status and business type codes.

A field with no rule is left untouched. A field whose rule names a generator that does not exist
becomes `[REDACTED]` rather than leaking the original, so a mistake in the rules fails safe.

### Configuring it

`SANITIZE_DATA` defaults to `true`. It should only ever be turned off where the caller is
genuinely entitled to real data. When sanitization is enabled, `SANITIZE_SECRET` must be set;
the service throws rather than returning unsanitized data if it is missing.

Keep `SANITIZE_SECRET` stable within an environment. Rotating it changes every fake value the
API has ever returned.

## Echoing recent updates

Sanitization creates a problem for the third parties calling this API: a caller never sees real
data, so after `updateBusinessAllFields`/`updateCustomerAllFields` succeeds, the next query
re-sanitizes the record and returns a *different* fake value. The caller cannot tell whether
their write actually took effect.

This is safe to solve by remembering and replaying the caller's own submission, because when
sanitization is on a caller only ever edits a fake value in the first place. Replaying it back
reveals nothing they did not already know.

When a mutation succeeds, the sanitized fields of its input (see
[What is and is not substituted](#what-is-and-is-not-substituted)) are projected into the shape
of the matching read type and kept in an in-memory cache (`src/update-echo/`), keyed by SBI or
CRN. The next query for that SBI/CRN overlays the cached fragment onto the freshly sanitized
response, so the caller sees what they submitted. Unsanitized fields, and anything the mutation
accepted but has no read equivalent for (e.g. `legalStatusCode`, `title`), are never cached.
An address is echoed whole, translated the same way a later read would return it (see
[Addresses](#addresses)).

The cache is plain `@hapi/catbox` backed by `@hapi/catbox-memory`, the same approach already used
for the DAL token (`src/common/helpers/caching/token-cache.js`). That is only safe because this
service runs a single replica: with more than one, an update and the following read could land on
different instances and the echo would be missed. If that changes, this needs a shared store
(e.g. `@hapi/catbox-redis`) instead.

### Configuring it

`UPDATE_ECHO_ENABLED` defaults to `true` and is a no-op whenever `SANITIZE_DATA` is `false`, since
there is nothing to echo past when the data is already real. `UPDATE_ECHO_TTL_MS` (default 15
minutes) bounds how long an echoed value is remembered for; once it expires the field reverts to
a freshly sanitized fake value rather than the submitted one, which is an accepted trade-off
rather than a bug.

### Limitations

The echo reflects what the caller *submitted*, not what the DAL actually persisted. If the DAL
silently normalizes or rejects part of an update, the caller still sees their original value
until the cache entry expires.

## Restricting access by CRN

As an extra safeguard, the API only serves callers whose Defra ID token is for a CRN on an
allow-list. This matters where several accounts share a password, so knowing a CRN is enough to
sign in as that person.

- `RESTRICT_CRNS` (default `true`) turns the restriction on or off.
- `ALLOWED_CRNS` is a comma separated list of the CRNs that may use the API, for example
  `ALLOWED_CRNS=1000000001,1000000002`. Spaces and blank entries are ignored. A malformed CRN
  (not ten digits, or starting with zero) stops the service starting.

While `RESTRICT_CRNS` is `true`, a request to the GraphQL endpoint is refused with
**HTTP 403** and no DAL call is made unless the CRN in its Defra ID token (the `contactId` claim) is
in `ALLOWED_CRNS`. The response is shaped like a GraphQL error and never says why, or which CRNs are
allowed:

```json
{
  "errors": [
    {
      "message": "The signed-in user does not have permission to access this data",
      "extensions": { "code": "FORBIDDEN" }
    }
  ]
}
```

The same response is returned when there is no token, the token is not a Defra ID token, or
`ALLOWED_CRNS` is empty. In that last case the service still starts, so every request is refused
and a warning is logged at startup. Set `RESTRICT_CRNS=false` to permit any CRN, which logs a
warning at startup too. `GET /health` is never restricted.

Things to be aware of:

- Because it defaults to `true`, every deployed environment must set `ALLOWED_CRNS` or
  `RESTRICT_CRNS=false`, otherwise all requests are refused.
- Only the CRN **in the caller's token** is checked, not the `crn` or `sbi` a query asks about.
- The token's signature is not verified here, only decoded. The DAL verifies it on every call, so a
  forged token for an allowed CRN passes this check but is rejected by the DAL.
- Refused requests are logged with a reason only. The CRN and token are never logged. With
  [auditing](#auditing) on, a `denied` audit event is published too.
- Locally, `.env.example` and `compose.yml` set `RESTRICT_CRNS=false`.

## Auditing

With `AUDIT_ENABLED=true` the service publishes an event to
[FCP Audit](https://github.com/DEFRA/fcp-audit) for every read or update of business or personal
data, using [`@defra/fcp-audit-publisher`](https://github.com/DEFRA/fcp-audit-publisher) to send
it to the SNS topic in `AUDIT_SNS_TOPIC_ARN`. It is off by default, so local development and the
published image need nothing extra.

The DAL publishes its own events for the same calls. Ours add what only this service knows: which
third party asked, and exactly what was returned to them. Both carry the same `correlationid`.

### What is audited

One event is published per root field of a GraphQL request, after the response is ready:

| Operation | Entities (`entity` / `action` / `entityid`) | Accounts |
| --- | --- | --- |
| `business(sbi)` | `business` / `read` / SBI | `sbi`, `organisationId` |
| `business { customer(crn) }` | `permission-list` / `read` / `<sbi>-<crn>`, in the business event | `sbi`, `crn` |
| `customer(crn)` | `person` / `read` / CRN | `crn` |
| `updateBusinessAllFields` | `business` / `updated` / SBI | `sbi` |
| `updateCustomerAllFields` | `person` / `updated` / CRN | `crn` |
| Refused by the CRN restriction | `request` / `rejected` / correlation ID | |

Only successes and authorisation failures are audited. A request the DAL refuses (`UNAUTHORIZED`,
`FORBIDDEN`, or HTTP 401 or 403) is published with status `denied`. Validation errors and DAL
outages are not audited: no data was read or changed.

### What an event contains

| Field | Value |
| --- | --- |
| `application` | `FAL Third Party API` |
| `component` | `fcp-tp-external-api` |
| `environment` | `cdp-<ENVIRONMENT>`, or `local` |
| `correlationid` | The `x-cdp-request-id` trace ID |
| `user` | `IDM/<contactId>` from the Defra ID token |
| `sessionid` | The Defra ID token's `sessionId` |
| `ip` | The calling service's IP: the first `x-forwarded-for` entry, else the remote address |
| `audit.status` | `success` or `denied` |
| `audit.details.rootField` | The root field, or its alias |
| `audit.details.arguments` | The root field's arguments as JSON, including the full input of an update |
| `audit.details.responseBody` | The data returned for the root field as JSON. Everything returned is treated as read |
| `audit.details.sourceSystemEntityId` | The Defra ID token's `azp`: the third party's client ID |
| `audit.details.errorCodes` | Why a `denied` event was refused |

FCP Audit lowercases every key it receives, so `arguments` and `responseBody` are sent as JSON
strings to keep their shape.

The Defra ID token is not verified by this service. On `success` events, and `denied` events
where the DAL returned 403, the DAL has verified it, so `user`, `sessionid` and
`sourceSystemEntityId` can be trusted. On events refused by the CRN restriction, or by the DAL
with 401, the token was never verified and those claims could be forged.

### Personal data

Audit events contain personal data by design. Logs never do: an event that fails to publish is
logged with the error only, never the event, and the request continues. In production the request
log also drops the forwarded Defra ID token and the query string.

### AWS access

The SNS client is set up as in `fcp-audit-publisher-stub`. The region defaults to `eu-west-2`. On
CDP there is no endpoint or keys, so the client uses the service's IAM role. Locally,
`AWS_ENDPOINT_URL` points it at Floci with the access keys alongside. The topic, and its
subscription to FCP Audit's queue, are platform configuration outside this repository.

### Trying it locally

`compose.yml` has a Floci (`hectorvent/floci`) AWS emulator under the `audit`
profile. `floci/init.sh` creates the topic `fcp_tp_external_api_audit` and subscribes a queue to
it named `fcp_audit`, like FCP Audit's own.

1. In `.env`, set `AUDIT_ENABLED=true` and uncomment the auditing block, which sets
   `COMPOSE_PROFILES=audit`.
2. Run `npm run local`.
3. Call the API, then read the events:

   ```bash
   docker compose run --rm --entrypoint aws floci-init sqs receive-message \
     --queue-url http://floci:4566/000000000000/fcp_audit \
     --max-number-of-messages 10
   ```

   Each event is the `Message` inside an SNS envelope.

`DAL_AUDIT_SNS_TOPIC_ARN` points the local DAL at the same topic, so its events for a request
show up next to ours with the same `correlationid`.

To feed a local [fcp-audit](https://github.com/DEFRA/fcp-audit) instead, point `AWS_ENDPOINT_URL`
at its Floci (`http://localhost:4567`) and `AUDIT_SNS_TOPIC_ARN` at its
`fcp_audit_publisher_stub` topic.

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

- Node.js 26 (`nvm use` picks it up from `.nvmrc`)
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
| `dal-mock` | 3100 | [fcp-dal-upstream-services-mock](https://github.com/DEFRA/fcp-dal-upstream-services-mock), which stubs the KITS and Hitachi services the DAL calls |
| `mongodb` | 27017 | The DAL's database |
| `fcp-tp-external-api` | 3001 | This service. Only under the `app` profile |
| `floci` | 4566 | Local AWS emulator for [audit events](#trying-it-locally). Only under the `audit` profile |
| `floci-init` | | Creates the audit topic and queue in Floci. Only under the `audit` profile |

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
| `DAL_TENANT_ID` | yes, unless `DAL_DISABLE_AUTH=true` | | Entra tenant ID |
| `DAL_TOKEN_ENDPOINT` | yes, unless `DAL_DISABLE_AUTH=true` | | Entra token endpoint |
| `DAL_CLIENT_ID` | yes, unless `DAL_DISABLE_AUTH=true` | | Entra client ID of this service |
| `DAL_CLIENT_SECRET` | yes, unless `DAL_DISABLE_AUTH=true` | | Entra client secret of this service |
| `SANITIZE_DATA` | | `true` | Substitute business and personal data before responding |
| `SANITIZE_SECRET` | yes, when sanitizing | | Secret keying the substitution |
| `UPDATE_ECHO_ENABLED` | | `true` | Echo a caller's own recent updates back past the sanitizer |
| `UPDATE_ECHO_TTL_MS` | | `900000` | How long an echoed update is remembered for |
| `RESTRICT_CRNS` | | `true` | Only allow callers whose Defra ID token is for a CRN in `ALLOWED_CRNS` |
| `ALLOWED_CRNS` | | | Comma separated CRNs permitted while `RESTRICT_CRNS` is `true`. Empty refuses every request |
| `GRAPHQL_PATH` | | `/graphql` | Path the API is served from |
| `GRAPHQL_INTROSPECTION_ENABLED` | | off in production | Allow schema introspection |
| `LOG_LEVEL` | | `info` | Logging level |
| `LOG_FORMAT` | | `ecs` in production | `ecs` or `pino-pretty` |
| `HTTP_PROXY` | | | Set by CDP. Routes outbound traffic through the platform proxy |
| `ENABLE_SECURE_CONTEXT` | | on in production | Load CDP's CA certificates |
| `ENABLE_METRICS` | | on in production | Report CloudWatch metrics |
| `TRACING_HEADER` | | `x-cdp-request-id` | Header carrying the CDP trace ID |
| `AUDIT_ENABLED` | | `false` | Publish FCP Audit events |
| `AUDIT_SNS_TOPIC_ARN` | yes, when auditing | | SNS topic to publish audit events to |
| `AWS_REGION` | | `eu-west-2` | Region of the audit topic |
| `AWS_ENDPOINT_URL` | | | Local only. Points the SNS client at Floci |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | | | Local only, with `AWS_ENDPOINT_URL`. CDP uses the service's IAM role |

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
