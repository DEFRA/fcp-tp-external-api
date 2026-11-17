// The DAL stores an address as one of two alternative sets of fields: postcode lookup
// fields when it has a UPRN, otherwise manual lines where line4 holds the county.
// These functions translate between that and the API's single simple shape. See the
// README's "Addresses" section.

// The lookup fields that make up the address lines. County is deliberately excluded.
const LOOKUP_LINE_FIELDS = [
  'pafOrganisationName',
  'flatName',
  'buildingName',
  'buildingNumberRange',
  'street',
  'doubleDependentLocality',
  'dependentLocality'
]

const NO_LOOKUP_LINE_FIELDS = Object.fromEntries(LOOKUP_LINE_FIELDS.map((field) => [field, null]))

const clean = (value) => (typeof value === 'string' ? value.trim() || null : null)

const join = (parts, separator) => parts.map(clean).filter(Boolean).join(separator) || null

const isLookupAddress = (address) =>
  Boolean(clean(address.uprn)) && LOOKUP_LINE_FIELDS.some((field) => clean(address[field]))

const lookupLines = (address) => [
  join([address.pafOrganisationName, address.flatName, address.buildingName], ', '),
  join([address.buildingNumberRange, address.street], ' '),
  join([address.doubleDependentLocality, address.dependentLocality], ', ')
]

const manualLines = (address) => [address.line1, address.line2, address.line3].map(clean)

export function fromDalAddress (address) {
  if (!address) {
    return null
  }

  const isLookup = isLookupAddress(address)
  const [line1 = null, line2 = null, line3 = null] = (isLookup ? lookupLines(address) : manualLines(address)).filter(Boolean)

  return {
    line1,
    line2,
    line3,
    city: clean(address.city),
    county: clean(isLookup ? address.county : address.line4),
    postalCode: clean(address.postalCode),
    country: clean(address.country),
    uprn: clean(address.uprn)
  }
}

// Always sends every DAL field, so whichever set is not in use is cleared
export function toDalAddress (address) {
  if (!address) {
    return address
  }

  const uprn = clean(address.uprn)
  const shared = {
    city: clean(address.city),
    postalCode: clean(address.postalCode),
    country: clean(address.country),
    uprn
  }

  if (uprn) {
    return {
      ...NO_LOOKUP_LINE_FIELDS,
      buildingName: clean(address.line1),
      street: clean(address.line2),
      dependentLocality: clean(address.line3),
      county: clean(address.county),
      line1: null,
      line2: null,
      line3: null,
      line4: null,
      line5: null,
      ...shared
    }
  }

  return {
    ...NO_LOOKUP_LINE_FIELDS,
    county: null,
    line1: clean(address.line1),
    line2: clean(address.line2),
    line3: clean(address.line3),
    line4: clean(address.county),
    line5: null,
    ...shared
  }
}

// The DAL's business address input is a one-of keyed on whether there is a UPRN
export function toDalValidAddress (address) {
  const dalAddress = toDalAddress(address)

  if (!dalAddress) {
    return dalAddress
  }

  return dalAddress.uprn ? { withUprn: dalAddress } : { withoutUprn: dalAddress }
}
