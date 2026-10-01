// Translates a mutation input into the shape of the matching read type, keeping
// only the fields the sanitizer substitutes (see src/sanitizer/rules.js) so the
// echoed value can only ever be something the caller themselves submitted.
const ADDRESS_FIELDS = [
  'pafOrganisationName',
  'buildingNumberRange',
  'buildingName',
  'flatName',
  'street',
  'city',
  'county',
  'postalCode',
  'country',
  'dependentLocality',
  'doubleDependentLocality',
  'line1',
  'line2',
  'line3',
  'line4',
  'line5',
  'uprn'
]

function present (object, key) {
  return object !== null && object !== undefined && Object.hasOwn(object, key)
}

function projectEmail (email) {
  return email === null ? null : { address: email.address ?? null }
}

function projectPhone (phone) {
  return phone === null ? null : { mobile: phone.mobile ?? null, landline: phone.landline ?? null }
}

function projectAddress (address) {
  if (address === null) {
    return null
  }

  const result = {}
  for (const field of ADDRESS_FIELDS) {
    if (present(address, field)) {
      result[field] = address[field]
    }
  }
  return result
}

export function projectBusinessUpdate (input = {}) {
  const info = {}

  if (present(input, 'vat')) {
    info.vat = input.vat
  }
  if (present(input, 'email')) {
    info.email = projectEmail(input.email)
  }
  if (present(input, 'phone')) {
    info.phone = projectPhone(input.phone)
  }
  if (present(input, 'address')) {
    const address = input.address ? (input.address.withUprn ?? input.address.withoutUprn ?? null) : null
    info.address = projectAddress(address)
  }

  return Object.keys(info).length ? { info } : null
}

export function projectCustomerUpdate (input = {}) {
  const info = {}

  const name = {}
  if (present(input, 'first')) {
    name.first = input.first
  }
  if (present(input, 'middle')) {
    name.middle = input.middle
  }
  if (present(input, 'last')) {
    name.last = input.last
  }
  if (Object.keys(name).length) {
    info.name = name
  }

  if (present(input, 'dateOfBirth')) {
    info.dateOfBirth = input.dateOfBirth
  }
  if (present(input, 'email')) {
    info.email = projectEmail(input.email)
  }
  if (present(input, 'phone')) {
    info.phone = projectPhone(input.phone)
  }
  if (present(input, 'address')) {
    info.address = projectAddress(input.address)
  }

  return Object.keys(info).length ? { info } : null
}
