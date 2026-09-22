import { describe, test, expect } from 'vitest'
import { createSeed } from '../../../src/sanitizer/hash.js'
import { generate } from '../../../src/sanitizer/generators.js'

describe('createSeed', () => {
  test('returns a stable sha256 hex digest', () => {
    const seed = createSeed('James Henderson', 'secret', 'CustomerName.first')

    expect(seed).toMatch(/^[0-9a-f]{64}$/)
    expect(seed).toBe(createSeed('James Henderson', 'secret', 'CustomerName.first'))
  })

  test('varies by field path so the same value differs per field', () => {
    expect(createSeed('Smith', 'secret', 'CustomerName.last')).not.toBe(
      createSeed('Smith', 'secret', 'Address.city')
    )
  })

  test('varies by secret', () => {
    expect(createSeed('Smith', 'secret-a', 'CustomerName.last')).not.toBe(
      createSeed('Smith', 'secret-b', 'CustomerName.last')
    )
  })
})

describe('generate', () => {
  const seed = createSeed('a value', 'secret', 'a.path')

  test('redacts values it has no generator for', () => {
    expect(generate('notAGenerator', seed)).toBe('[REDACTED]')
  })

  test('is deterministic for a given seed', () => {
    expect(generate('vat', seed)).toBe(generate('vat', seed))
  })

  test.each([
    ['vat', /^GB\d{9}$/],
    ['mobile', /^07\d{9}$/],
    ['landline', /^01\d{9}$/],
    ['uprn', /^\d{12}$/],
    ['postcode', /^[A-Z]{2}\d+ \d[A-Z]{2}$/],
    ['dateOfBirth', /^\d{4}-\d{2}-\d{2}$/],
    ['addressLine', /^\d+ \w/],
    ['email', /^[a-z]+\.[a-z]+@[a-z.]+$/],
    ['fullName', /^[A-Za-z]+ [A-Za-z]+$/]
  ])('generates a plausible %s', (kind, pattern) => {
    expect(generate(kind, seed)).toMatch(pattern)
  })
})
