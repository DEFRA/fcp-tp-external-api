import { describe, test, expect } from 'vitest'
import { assertValidSbi, assertValidCrn } from '../../../src/graphql/validation.js'

describe('assertValidSbi', () => {
  test('accepts a nine digit identifier', () => {
    expect(() => assertValidSbi('107183280')).not.toThrow()
  })

  test.each(['0071832801', '10718328', '1071832801', 'not-an-sbi', '007183280'])(
    'rejects %s',
    (sbi) => {
      expect(() => assertValidSbi(sbi)).toThrow('sbi is not valid')
    }
  )
})

describe('assertValidCrn', () => {
  test('accepts a ten digit reference number', () => {
    expect(() => assertValidCrn('1102634220')).not.toThrow()
  })

  test.each(['110263422', '11026342201', '0102634220', 'not-a-crn'])(
    'rejects %s',
    (crn) => {
      expect(() => assertValidCrn(crn)).toThrow('crn is not valid')
    }
  )
})
