import { describe, test, expect } from 'vitest'
import { projectBusinessUpdate, projectCustomerUpdate } from '../../../src/update-echo/projections.js'

describe('projectBusinessUpdate', () => {
  test('returns null when nothing echoable was submitted', () => {
    expect(projectBusinessUpdate({ sbi: '107183280', name: 'Henderson Family Farms' })).toBeNull()
  })

  test('projects vat, email and phone as submitted', () => {
    const input = {
      sbi: '107183280',
      vat: '123456789',
      email: { address: 'new@example.com' },
      phone: { mobile: '07700900000', landline: '01144960123' }
    }

    expect(projectBusinessUpdate(input)).toEqual({
      info: {
        vat: '123456789',
        email: { address: 'new@example.com' },
        phone: { mobile: '07700900000', landline: '01144960123' }
      }
    })
  })

  test('projects an address from whichever oneOf branch was submitted', () => {
    const withUprn = projectBusinessUpdate({
      sbi: '107183280',
      address: { withUprn: { line1: '1 New Street', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK', uprn: '123' } }
    })

    expect(withUprn).toEqual({
      info: { address: { line1: '1 New Street', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK', uprn: '123' } }
    })

    const withoutUprn = projectBusinessUpdate({
      sbi: '107183280',
      address: { withoutUprn: { line1: '2 New Street', city: 'Leeds', postalCode: 'LS1 1AB', country: 'UK' } }
    })

    expect(withoutUprn).toEqual({
      info: { address: { line1: '2 New Street', city: 'Leeds', postalCode: 'LS1 1AB', country: 'UK' } }
    })
  })

  test('keeps an explicit null as a clear rather than dropping the field', () => {
    expect(projectBusinessUpdate({ sbi: '107183280', email: null })).toEqual({ info: { email: null } })
    expect(projectBusinessUpdate({ sbi: '107183280', phone: null })).toEqual({ info: { phone: null } })
    expect(projectBusinessUpdate({ sbi: '107183280', address: null })).toEqual({ info: { address: null } })
  })

  test('excludes fields that are not sanitized or have no read equivalent', () => {
    const input = {
      sbi: '107183280',
      name: 'Henderson Family Farms',
      legalStatusCode: 1,
      typeCode: 2,
      dateStartedFarming: '2020-01-01',
      correspondenceEmail: { address: 'c@example.com' },
      correspondencePhone: { mobile: '07700900000' },
      correspondenceAddress: { withoutUprn: { line1: '1 Road', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK' } },
      isCorrespondenceAsBusinessAddress: true,
      registrationNumbers: { charityCommission: '123', companiesHouse: '456' }
    }

    expect(projectBusinessUpdate(input)).toBeNull()
  })
})

describe('projectCustomerUpdate', () => {
  test('returns null when nothing echoable was submitted', () => {
    expect(projectCustomerUpdate({ crn: '1102634220', title: 'Mr' })).toBeNull()
  })

  test('projects name parts, dateOfBirth, email, phone and address', () => {
    const input = {
      crn: '1102634220',
      first: 'Jamie',
      middle: 'Alan',
      last: 'Henderson',
      dateOfBirth: '1972-04-17',
      email: { address: 'jamie@example.com' },
      phone: { mobile: '07700900000', landline: null },
      address: { line1: '1 New Street', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK' }
    }

    expect(projectCustomerUpdate(input)).toEqual({
      info: {
        name: { first: 'Jamie', middle: 'Alan', last: 'Henderson' },
        dateOfBirth: '1972-04-17',
        email: { address: 'jamie@example.com' },
        phone: { mobile: '07700900000', landline: null },
        address: { line1: '1 New Street', city: 'Leeds', postalCode: 'LS1 1AA', country: 'UK' }
      }
    })
  })

  test('projects a partial name update', () => {
    expect(projectCustomerUpdate({ crn: '1102634220', first: 'Jamie' })).toEqual({
      info: { name: { first: 'Jamie' } }
    })
    expect(projectCustomerUpdate({ crn: '1102634220', last: 'Smith' })).toEqual({
      info: { name: { last: 'Smith' } }
    })
  })

  test('excludes fields that are not sanitized or have no read equivalent', () => {
    const input = { crn: '1102634220', title: 'Mr', otherTitle: 'Dr', doNotContact: true }

    expect(projectCustomerUpdate(input)).toBeNull()
  })

  test('keeps an explicit null address as a clear', () => {
    expect(projectCustomerUpdate({ crn: '1102634220', address: null })).toEqual({ info: { address: null } })
  })
})
