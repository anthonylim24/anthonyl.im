import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isConstrainedSessionViewport,
  isTeslaUserAgent,
  orbQualityForTier,
} from '../breathworkViewport'

describe('breathworkViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects Tesla user agents', () => {
    expect(isTeslaUserAgent('Mozilla/5.0 Tesla/2024.1')).toBe(true)
    expect(isTeslaUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe(false)
  })

  it('treats Tesla browsers as constrained session viewports', () => {
    expect(isConstrainedSessionViewport('Mozilla/5.0 (X11; Linux x86_64) Tesla/2024.26')).toBe(true)
  })

  it('treats short landscape plus coarse pointer as constrained', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches:
          query.includes('orientation: landscape') ||
          query.includes('max-height: 700px') ||
          query.includes('pointer: coarse'),
      }),
    })

    expect(isConstrainedSessionViewport('Mozilla/5.0')).toBe(true)
  })

  it('does not constrain a tall desktop viewport', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    })

    expect(isConstrainedSessionViewport('Mozilla/5.0')).toBe(false)
  })

  it('maps GPU tiers to shader quality', () => {
    expect(orbQualityForTier('high', false)).toBe(2)
    expect(orbQualityForTier('medium', false)).toBe(1)
    expect(orbQualityForTier('low', false)).toBe(0)
    expect(orbQualityForTier('high', true)).toBe(0)
  })
})
