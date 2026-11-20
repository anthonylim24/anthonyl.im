import { describe, expect, it } from 'vitest'
import { GIVE_UP_MS, parseFit, shed, startTier, type Tier } from '../scene/quality'

const desk = { webgpu: true, mobile: false }
const phone = { webgpu: true, mobile: true }
const gl2 = { webgpu: false, mobile: false }
const slow = (median: number, dpr = 1, floor = 1) => ({ median, dpr, floor })

describe('where the stage starts', () => {
  it('starts Auto at full quality on a desktop and one rung lighter on a phone', () => {
    expect(startTier('auto', desk, null)).toEqual({ look: 'lit', rung: 'gi' })
    expect(startTier('auto', phone, null)).toEqual({ look: 'lit', rung: 'ssr' })
  })

  it('starts Auto where it settled last time on this device', () => {
    expect(startTier('auto', desk, { look: 'lit', rung: 'ao' })).toEqual({ look: 'lit', rung: 'ao' })
    expect(startTier('auto', desk, { look: 'toon' })).toEqual({ look: 'toon' })
  })

  it('gives High and Low exactly what they say, whatever Auto learned', () => {
    expect(startTier('high', phone, { look: 'toon' })).toEqual({ look: 'lit', rung: 'gi' })
    expect(startTier('low', desk, null)).toEqual({ look: 'toon' })
  })

  it('keeps the WebGL2 fallback on the toon look unless High is asked for, and then without screen-space effects', () => {
    expect(startTier('auto', gl2, null)).toEqual({ look: 'toon' })
    expect(startTier('high', gl2, null)).toEqual({ look: 'lit', rung: 'lit' })
  })
})

describe('Auto shedding load', () => {
  it('drops GI, then reflections, then ambient occlusion, one slow window at a time', () => {
    let tier: Tier = { look: 'lit', rung: 'gi' }
    const seen: Tier[] = []
    for (let i = 0; i < 3; i++) seen.push((tier = shed(tier, slow(40, 1.75))))
    expect(seen).toEqual([{ look: 'lit', rung: 'ssr' }, { look: 'lit', rung: 'ao' }, { look: 'lit', rung: 'lit' }])
  })

  it('lets the stage lower its resolution before it gives up the lit look', () => {
    expect(shed({ look: 'lit', rung: 'lit' }, slow(60, 1.5, 1))).toEqual({ look: 'lit', rung: 'lit' })
  })

  it('gives up the lit look only when still very slow at the lowest resolution', () => {
    expect(shed({ look: 'lit', rung: 'lit' }, slow(GIVE_UP_MS - 5))).toEqual({ look: 'lit', rung: 'lit' })
    expect(shed({ look: 'lit', rung: 'lit' }, slow(GIVE_UP_MS + 5))).toEqual({ look: 'toon' })
    expect(shed({ look: 'toon' }, slow(80))).toEqual({ look: 'toon' })
  })
})

describe('what Auto remembers', () => {
  const now = 1_000_000_000_000
  it('reads back a fit from this week and forgets older or broken ones', () => {
    expect(parseFit(JSON.stringify({ look: 'lit', rung: 'ao', at: now - 1000 }), now)).toEqual({ look: 'lit', rung: 'ao' })
    expect(parseFit(JSON.stringify({ look: 'toon', at: now - 1000 }), now)).toEqual({ look: 'toon' })
    expect(parseFit(JSON.stringify({ look: 'lit', rung: 'ao', at: now - 8 * 24 * 3600 * 1000 }), now)).toBeNull()
    expect(parseFit(JSON.stringify({ look: 'lit', rung: 'ultra', at: now }), now)).toBeNull()
    expect(parseFit('{', now)).toBeNull()
    expect(parseFit(null, now)).toBeNull()
  })
})
