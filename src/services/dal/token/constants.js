export const DAL_TOKEN_CACHE_KEY = 'dal-token'

// Expire the cached token early so it is never used in the moments before Entra rejects it.
export const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000
