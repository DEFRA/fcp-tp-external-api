import {
  FIRST_NAMES,
  MIDDLE_NAMES,
  LAST_NAMES,
  BUSINESS_PREFIXES,
  BUSINESS_SUFFIXES,
  BUILDING_NAMES,
  FLAT_NAMES,
  STREETS,
  AREAS,
  TOWNS,
  COUNTIES,
  COUNTRIES,
  ORGANISATION_NAMES,
  EMAIL_DOMAINS,
  POSTCODE_AREAS
} from './fake-data.js'

// seedHex is a 64 character SHA-256 digest. Each selection consumes 4 hex
// characters (2 bytes) from a given offset, so generators use different offsets
// to keep the parts of a composite value uncorrelated.
function pickFromList (list, seedHex, offset) {
  const byte1 = parseInt(seedHex.substring(offset, offset + 2), 16)
  const byte2 = parseInt(seedHex.substring(offset + 2, offset + 4), 16)
  return list[(((byte1 << 8) | byte2) % list.length)]
}

function generateNumber (seedHex, offset, min, max) {
  const byte1 = parseInt(seedHex.substring(offset, offset + 2), 16)
  const byte2 = parseInt(seedHex.substring(offset + 2, offset + 4), 16)
  return min + (((byte1 << 8) | byte2) % (max - min + 1))
}

function generateDigits (seedHex, offset, length) {
  let digits = ''
  for (let i = 0; i < length; i++) {
    const byte = parseInt(seedHex.substring(offset + (i * 2), offset + (i * 2) + 2), 16)
    digits += String(byte % 10)
  }
  return digits
}

const generators = {
  firstName: (seedHex) => pickFromList(FIRST_NAMES, seedHex, 0),
  middleName: (seedHex) => pickFromList(MIDDLE_NAMES, seedHex, 4),
  lastName: (seedHex) => pickFromList(LAST_NAMES, seedHex, 8),

  fullName: (seedHex) =>
    `${pickFromList(FIRST_NAMES, seedHex, 0)} ${pickFromList(LAST_NAMES, seedHex, 4)}`,

  businessName: (seedHex) =>
    `${pickFromList(BUSINESS_PREFIXES, seedHex, 0)} ${pickFromList(BUSINESS_SUFFIXES, seedHex, 4)}`,

  organisationName: (seedHex) => pickFromList(ORGANISATION_NAMES, seedHex, 0),
  buildingName: (seedHex) => pickFromList(BUILDING_NAMES, seedHex, 0),
  flatName: (seedHex) => pickFromList(FLAT_NAMES, seedHex, 0),
  buildingNumberRange: (seedHex) => String(generateNumber(seedHex, 0, 1, 150)),

  street: (seedHex) => pickFromList(STREETS, seedHex, 0),

  addressLine: (seedHex) =>
    `${generateNumber(seedHex, 0, 1, 150)} ${pickFromList(STREETS, seedHex, 4)}`,

  locality: (seedHex) => pickFromList(AREAS, seedHex, 0),
  city: (seedHex) => pickFromList(TOWNS, seedHex, 0),
  county: (seedHex) => pickFromList(COUNTIES, seedHex, 0),
  country: (seedHex) => pickFromList(COUNTRIES, seedHex, 0),

  postcode: (seedHex) => {
    const area = pickFromList(POSTCODE_AREAS, seedHex, 0)
    const district = generateNumber(seedHex, 4, 1, 18)
    const sector = generateNumber(seedHex, 8, 0, 9)
    const letter1 = String.fromCharCode(65 + (parseInt(seedHex.substring(12, 14), 16) % 26))
    const letter2 = String.fromCharCode(65 + (parseInt(seedHex.substring(14, 16), 16) % 26))
    return `${area}${district} ${sector}${letter1}${letter2}`
  },

  uprn: (seedHex) => generateDigits(seedHex, 0, 12),

  email: (seedHex) => {
    const firstName = pickFromList(FIRST_NAMES, seedHex, 0).toLowerCase()
    const lastName = pickFromList(LAST_NAMES, seedHex, 4).toLowerCase()
    return `${firstName}.${lastName}@${pickFromList(EMAIL_DOMAINS, seedHex, 8)}`
  },

  mobile: (seedHex) => `07${generateDigits(seedHex, 0, 9)}`,
  landline: (seedHex) => `01${generateDigits(seedHex, 0, 9)}`,

  vat: (seedHex) => `GB${generateDigits(seedHex, 0, 9)}`,

  dateOfBirth: (seedHex) => {
    const year = generateNumber(seedHex, 0, 1940, 2000)
    const month = generateNumber(seedHex, 4, 1, 12)
    const day = generateNumber(seedHex, 8, 1, 28)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
}

export function generate (kind, seedHex) {
  const generator = generators[kind]
  return generator ? generator(seedHex) : '[REDACTED]'
}
