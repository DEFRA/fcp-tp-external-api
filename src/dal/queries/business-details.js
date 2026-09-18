import { addressFields } from './fragments.js'

export const businessDetailsQuery = `
  query Business($sbi: ID!) {
    business(sbi: $sbi) {
      organisationId
      sbi
      info {
        name
        vat
        traderNumber
        vendorNumber
        legalStatus {
          code
          type
        }
        type {
          code
          type
        }
        address {
          ${addressFields}
        }
        email {
          address
        }
        phone {
          mobile
          landline
        }
      }
      countyParishHoldings {
        cphNumber
      }
    }
  }
`
