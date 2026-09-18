// Which fields of each type carry business or personal data, and which
// generator replaces them. Anything not listed is passed through untouched,
// so identifiers stay usable: sbi, crn, organisationId, traderNumber,
// vendorNumber, cphNumber, permission group ids and levels, and reference
// data codes are all deliberately preserved.
export const sanitizeRules = {
  Business: {
    children: {
      info: 'BusinessInfo'
    }
  },
  BusinessInfo: {
    fields: {
      name: 'businessName',
      vat: 'vat'
    },
    children: {
      address: 'Address',
      email: 'Email',
      phone: 'Phone'
    }
  },
  Customer: {
    children: {
      info: 'CustomerInfo'
    }
  },
  CustomerInfo: {
    fields: {
      dateOfBirth: 'dateOfBirth'
    },
    children: {
      name: 'CustomerName',
      address: 'Address',
      email: 'Email',
      phone: 'Phone'
    }
  },
  CustomerName: {
    fields: {
      first: 'firstName',
      middle: 'middleName',
      last: 'lastName'
    }
  },
  Address: {
    fields: {
      pafOrganisationName: 'organisationName',
      buildingNumberRange: 'buildingNumberRange',
      buildingName: 'buildingName',
      flatName: 'flatName',
      street: 'street',
      city: 'city',
      county: 'county',
      postalCode: 'postcode',
      country: 'country',
      dependentLocality: 'locality',
      doubleDependentLocality: 'locality',
      line1: 'addressLine',
      line2: 'locality',
      line3: 'city',
      line4: 'county',
      line5: 'postcode',
      uprn: 'uprn'
    }
  },
  Email: {
    fields: {
      address: 'email'
    }
  },
  Phone: {
    fields: {
      mobile: 'mobile',
      landline: 'landline'
    }
  }
}
