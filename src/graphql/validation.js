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

// The schema makes these non-null, but a blank string would still reach the DAL as null
export function assertValidAddress (address, name) {
  if (!address) {
    return
  }

  for (const field of REQUIRED_ADDRESS_FIELDS) {
    if (!address[field]?.trim()) {
      throw new GraphQLError(`${name}.${field} must not be blank`, {
        extensions: { code: 'BAD_USER_INPUT', argumentName: `${name}.${field}` }
      })
    }
  }
}
