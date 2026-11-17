// Which fields of each type carry business or personal data, and which
// generator replaces them. Anything not listed is passed through untouched,
// so identifiers stay usable: sbi, crn, organisationId, permission group ids
// and levels, and reference data codes are all deliberately preserved.
export const sanitizeRules = {
  Business: {
    children: {
      info: 'BusinessInfo',
      countyParishHoldings: 'CountyParishHolding'
    }
  },
  CountyParishHolding: {
    fields: {
      cphNumber: 'cphNumber'
    }
  },
  BusinessInfo: {
    fields: {
      vat: 'vat',
      traderNumber: 'traderNumber',
      vendorNumber: 'vendorNumber'
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
      line1: 'addressLine',
      line2: 'street',
      line3: 'locality',
      city: 'city',
      county: 'county',
      postalCode: 'postcode',
      country: 'country',
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
