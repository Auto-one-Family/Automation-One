import { describe, it, expect } from 'vitest'
import { normalizeXRequestIdHeader } from '@/utils/lastRestRequestId'

describe('normalizeXRequestIdHeader', () => {
  it('returns trimmed string for plain header value', () => {
    expect(normalizeXRequestIdHeader('  abc-123  ')).toBe('abc-123')
  })

  it('uses first element for array header value', () => {
    expect(normalizeXRequestIdHeader(['rid-1', 'rid-2'])).toBe('rid-1')
  })

  it('returns null for undefined, empty string, or whitespace-only', () => {
    expect(normalizeXRequestIdHeader(undefined)).toBeNull()
    expect(normalizeXRequestIdHeader('')).toBeNull()
    expect(normalizeXRequestIdHeader('   ')).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(normalizeXRequestIdHeader([])).toBeNull()
  })
})
