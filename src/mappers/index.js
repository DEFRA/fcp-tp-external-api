import { sanitize } from '../sanitizer/index.js'
import { fromDalAddress } from './address.js'

function mapEmail (email) {
  return email ? { address: email.address ?? null } : null
}

function mapPhone (phone) {
  return phone
    ? { mobile: phone.mobile ?? null, landline: phone.landline ?? null }
    : null
}

function mapCodeType (codeType) {
  return codeType
    ? { code: codeType.code ?? null, type: codeType.type ?? null }
    : null
}

export function mapBusiness (business) {
  if (!business) {
    return null
  }

  const mapped = {
    organisationId: business.organisationId ?? null,
    sbi: business.sbi,
    info: business.info
      ? {
          name: business.info.name ?? null,
          vat: business.info.vat ?? null,
          traderNumber: business.info.traderNumber ?? null,
          vendorNumber: business.info.vendorNumber ?? null,
          legalStatus: mapCodeType(business.info.legalStatus),
          type: mapCodeType(business.info.type),
          address: fromDalAddress(business.info.address),
          email: mapEmail(business.info.email),
          phone: mapPhone(business.info.phone)
        }
      : null,
    countyParishHoldings: (business.countyParishHoldings ?? []).map((cph) => ({
      cphNumber: cph.cphNumber ?? null
    }))
  }

  return sanitize(mapped, 'Business')
}

export function mapCustomer (customer) {
  if (!customer) {
    return null
  }

  const mapped = {
    crn: customer.crn,
    info: customer.info
      ? {
          name: customer.info.name
            ? {
                first: customer.info.name.first ?? null,
                middle: customer.info.name.middle ?? null,
                last: customer.info.name.last ?? null
              }
            : null,
          dateOfBirth: customer.info.dateOfBirth ?? null,
          address: fromDalAddress(customer.info.address),
          email: mapEmail(customer.info.email),
          phone: mapPhone(customer.info.phone)
        }
      : null
  }

  return sanitize(mapped, 'Customer')
}

// Permission groups hold no business or personal data, so they pass through untouched.
export function mapPermissionGroups (permissionGroups) {
  return (permissionGroups ?? []).map((group) => ({
    id: group.id ?? null,
    level: group.level ?? null
  }))
}
