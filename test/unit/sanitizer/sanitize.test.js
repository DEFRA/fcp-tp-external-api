import { describe, test, expect, vi, beforeEach } from 'vitest'

describe('sanitize', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('returns the node unchanged when sanitization is disabled', async () => {
    vi.doMock('../../../src/config.js', () => ({
      config: { get: (path) => (path === 'sanitize.isEnabled' ? false : undefined) }
    }))

    const { sanitize } = await import('../../../src/sanitizer/index.js')
    const node = { info: { vat: 'GB123456789' } }

    expect(sanitize(node, 'Business')).toBe(node)
  })

  test('sanitizes the node when sanitization is enabled', async () => {
    vi.doMock('../../../src/config.js', () => ({
      config: {
        get: (path) => {
          if (path === 'sanitize.isEnabled') {
            return true
          }
          if (path === 'sanitize.secret') {
            return 'a-secret'
          }
          return undefined
        }
      }
    }))

    const { sanitize } = await import('../../../src/sanitizer/index.js')
    const result = sanitize({ info: { vat: 'GB123456789' } }, 'Business')

    expect(result.info.vat).not.toBe('GB123456789')
  })
})
