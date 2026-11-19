// GraphQL coercion and validation messages repeat the caller's input, which can be personal data
const INPUT_ERROR_CODES = new Set([
  'BAD_USER_INPUT',
  'GRAPHQL_VALIDATION_FAILED',
  'GRAPHQL_PARSE_FAILED',
  'BAD_REQUEST',
  'BAD REQUEST'
])

export function safeErrorMessage (code, message) {
  return INPUT_ERROR_CODES.has(code) ? undefined : message
}
