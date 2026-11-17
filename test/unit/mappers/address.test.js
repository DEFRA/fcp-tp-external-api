import { describe, test, expect } from 'vitest'
import { fromDalAddress, toDalAddress, toDalValidAddress } from '../../../src/mappers/address.js'

const dalLookupAddress = {
  pafOrganisationName: 'FORTESCUE ESTATE',
  flatName: 'Flat 3',
  buildingName: 'Oakwood House',
  buildingNumberRange: '14',
  street: 'Oakwood Drive',
  doubleDependentLocality: 'Lower District',
  dependentLocality: 'Westbury Park',
  county: 'South Yorkshire',
  city: 'Sheffield',
  postalCode: 'S10 2GH',
  country: 'United Kingdom',
  line1: 'ignored',
  line4: 'ignored',
  line5: 'ignored',
  uprn: '100021432873'
}

const dalManualAddress = {
  pafOrganisationName: 'ignored',
  county: 'ignored',
  line1: 'Example Farm',
  line2: '14 Example Drive',
  line3: 'Exampleton',
  line4: 'Examplesire',
  line5: 'ignored',
  city: 'Exampletown',
  postalCode: 'AB1 2CD',
  country: 'United Kingdom',
  uprn: null
}

const manualAddress = {
  line1: 'Example Farm',
  line2: '14 Example Drive',
  line3: 'Exampleton',
  city: 'Exampletown',
  county: 'Examplesire',
  postalCode: 'AB1 2CD',
  country: 'United Kingdom',
  uprn: null
}

const lookupAddress = { ...manualAddress, uprn: '100012345678' }

describe('fromDalAddress', () => {
  test('returns null when there is no address', () => {
    expect(fromDalAddress(null)).toBeNull()
    expect(fromDalAddress(undefined)).toBeNull()
  })

  test('flattens a lookup address into lines and takes its county field', () => {
    expect(fromDalAddress(dalLookupAddress)).toEqual({
      line1: 'FORTESCUE ESTATE, Flat 3, Oakwood House',
      line2: '14 Oakwood Drive',
      line3: 'Lower District, Westbury Park',
      city: 'Sheffield',
      county: 'South Yorkshire',
      postalCode: 'S10 2GH',
      country: 'United Kingdom',
      uprn: '100021432873'
    })
  })

  test('uses the lines of a manual address and reads the county from line4', () => {
    expect(fromDalAddress(dalManualAddress)).toEqual(manualAddress)
  })

  test('uses the lines when an address has a UPRN but no lookup fields', () => {
    const address = { ...dalManualAddress, pafOrganisationName: null, uprn: '100012345678' }

    expect(fromDalAddress(address)).toEqual({ ...manualAddress, uprn: '100012345678' })
  })

  test('closes gaps so line1 is set whenever any line is', () => {
    const address = { uprn: '100012345678', buildingNumberRange: '1', street: 'Example Lane', dependentLocality: 'Exampleton' }

    expect(fromDalAddress(address)).toMatchObject({ line1: '1 Example Lane', line2: 'Exampleton', line3: null })
  })

  test('treats blank values as null', () => {
    const address = { line1: '  Example Farm ', line2: '', line3: '   ', line4: '', city: 'Exampletown' }

    expect(fromDalAddress(address)).toEqual({
      line1: 'Example Farm',
      line2: null,
      line3: null,
      city: 'Exampletown',
      county: null,
      postalCode: null,
      country: null,
      uprn: null
    })
  })
})

describe('toDalAddress', () => {
  test('passes a missing address straight through', () => {
    expect(toDalAddress(null)).toBeNull()
    expect(toDalAddress(undefined)).toBeUndefined()
  })

  test('writes a manual address into the lines, with the county in line4', () => {
    expect(toDalAddress(manualAddress)).toEqual({
      pafOrganisationName: null,
      flatName: null,
      buildingName: null,
      buildingNumberRange: null,
      street: null,
      doubleDependentLocality: null,
      dependentLocality: null,
      county: null,
      line1: 'Example Farm',
      line2: '14 Example Drive',
      line3: 'Exampleton',
      line4: 'Examplesire',
      line5: null,
      city: 'Exampletown',
      postalCode: 'AB1 2CD',
      country: 'United Kingdom',
      uprn: null
    })
  })

  test('writes an address with a UPRN into the lookup fields', () => {
    expect(toDalAddress(lookupAddress)).toEqual({
      pafOrganisationName: null,
      flatName: null,
      buildingName: 'Example Farm',
      buildingNumberRange: null,
      street: '14 Example Drive',
      doubleDependentLocality: null,
      dependentLocality: 'Exampleton',
      county: 'Examplesire',
      line1: null,
      line2: null,
      line3: null,
      line4: null,
      line5: null,
      city: 'Exampletown',
      postalCode: 'AB1 2CD',
      country: 'United Kingdom',
      uprn: '100012345678'
    })
  })

  test('saves blank optional fields as null and treats a blank UPRN as none', () => {
    const result = toDalAddress({ ...manualAddress, line2: '', line3: '  ', county: '', uprn: ' ' })

    expect(result).toMatchObject({ line2: null, line3: null, line4: null, uprn: null })
  })

  test.each([
    ['a manual address', manualAddress],
    ['an address with a UPRN', lookupAddress]
  ])('reads back %s exactly as it was written', (_name, address) => {
    expect(fromDalAddress(toDalAddress(address))).toEqual(address)
  })
})

describe('toDalValidAddress', () => {
  test('passes a missing address straight through', () => {
    expect(toDalValidAddress(null)).toBeNull()
  })

  test('wraps a manual address in withoutUprn', () => {
    expect(toDalValidAddress(manualAddress)).toEqual({ withoutUprn: toDalAddress(manualAddress) })
  })

  test('wraps an address with a UPRN in withUprn', () => {
    expect(toDalValidAddress(lookupAddress)).toEqual({ withUprn: toDalAddress(lookupAddress) })
  })
})
