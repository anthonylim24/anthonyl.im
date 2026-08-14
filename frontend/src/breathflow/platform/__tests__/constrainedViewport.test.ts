import { describe, expect, it } from 'vitest'
import { isConstrainedViewport, isTeslaUserAgent } from '../constrainedViewport'

describe('constrained viewport detection', () => {
  it('detects Tesla user agents', () => {
    expect(isTeslaUserAgent('Mozilla/5.0 (X11; GNU/Linux) ... Tesla/2024.26 Chrome/119')).toBe(true)
    expect(isTeslaUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(false)
  })

  it('is constrained for Tesla UA regardless of media query', () => {
    expect(isConstrainedViewport('Tesla/2024.26', false)).toBe(true)
  })

  it('is constrained for landscape + short + coarse pointer viewports', () => {
    expect(isConstrainedViewport('Mozilla/5.0 (iPad)', true)).toBe(true)
  })

  it('is unconstrained otherwise', () => {
    expect(isConstrainedViewport('Mozilla/5.0 (Macintosh)', false)).toBe(false)
  })
})
