import { GraphQLError } from 'graphql'

const SBI_PATTERN = /^[1-9]\d{8}$/
const CRN_PATTERN = /^[1-9]\d{9}$/

function assertMatches (value, pattern, name) {
  if (!pattern.test(String(value))) {
    throw new GraphQLError(`${name} is not valid`, {
      extensions: { code: 'BAD_USER_INPUT', argumentName: name }
    })
  }
}

export function assertValidSbi (sbi) {
  assertMatches(sbi, SBI_PATTERN, 'sbi')
}

export function assertValidCrn (crn) {
  assertMatches(crn, CRN_PATTERN, 'crn')
}

const REQUIRED_ADDRESS_FIELDS = ['line1', 'city', 'postalCode', 'country']

// Rural Payments' limits (PartyAddress.java), checked here so callers get a clear error rather than a DAL rejection
const ADDRESS_FIELD_MAX_LENGTHS = {
  line1: 240,
  line2: 240,
  line3: 240,
  city: 60,
  county: 60,
  country: 100,
  uprn: 12
}

const POSTCODE_MAX_LENGTH = 8

function addressError (message, argumentName) {
  return new GraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', argumentName }
  })
}

// The schema makes the required fields non-null, but a blank string would still reach the DAL as null
export function assertValidAddress (address, name) {
  if (!address) {
    return
  }

  for (const field of REQUIRED_ADDRESS_FIELDS) {
    if (!address[field]?.trim()) {
      throw addressError(`${name}.${field} must not be blank`, `${name}.${field}`)
    }
  }

  for (const [field, max] of Object.entries(ADDRESS_FIELD_MAX_LENGTHS)) {
    if ((address[field]?.trim().length ?? 0) > max) {
      throw addressError(`${name}.${field} must be ${max} characters or fewer`, `${name}.${field}`)
    }
  }

  // Rural Payments ignores spaces when checking a postcode's length
  if (address.postalCode.replaceAll(' ', '').length > POSTCODE_MAX_LENGTH) {
    throw addressError(`${name}.postalCode must be ${POSTCODE_MAX_LENGTH} characters or fewer, not counting spaces`, `${name}.postalCode`)
  }
}
