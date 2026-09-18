import { GraphQLError } from 'graphql'

const SBI_PATTERN = /^[1-9][0-9]{8}$/
const CRN_PATTERN = /^[1-9][0-9]{9}$/

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
