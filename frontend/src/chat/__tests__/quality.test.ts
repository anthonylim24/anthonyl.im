import { describe, expect, it } from 'vitest'
import { CRAWL_MS, GIVE_UP_MS, GRACE_MS, ours, parseFit, shed, startTier, strike, type Tier } from '../scene/quality'

const desk = { webgpu: true, mobile: false, still: false }
const phone = { webgpu: true, mobile: true, still: false }
const gl2 = { webgpu: false, mobile: false, still: false }
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

  it('lights the WebGL2 fallback and reduced motion without the screen-space passes', () => {
    expect(startTier('auto', gl2, null)).toEqual({ look: 'lit', rung: 'lit' })
    expect(startTier('high', gl2, null)).toEqual({ look: 'lit', rung: 'lit' })
    expect(startTier('auto', gl2, { look: 'lit', rung: 'gi' })).toEqual({ look: 'lit', rung: 'lit' })
    expect(startTier('high', { ...desk, still: true }, null)).toEqual({ look: 'lit', rung: 'lit' })
    expect(startTier('auto', gl2, { look: 'toon' })).toEqual({ look: 'toon' })
  })
})

describe('Auto shedding load', () => {
  it('drops GI, then reflections, then ambient occlusion, one slow window at a time', () => {
    let tier: Tier = { look: 'lit', rung: 'gi' }
    const seen: Tier[] = []
    for (let i = 0; i < 3; i++) seen.push((tier = shed(tier, slow(40, 1.75))))
    expect(seen).toEqual([{ look: 'lit', rung: 'ssr' }, { look: 'lit', rung: 'ao' }, { look: 'lit', rung: 'lit' }])
  })

  it('drops every screen-space pass at once when frames crawl', () => {
    expect(shed({ look: 'lit', rung: 'gi' }, slow(CRAWL_MS + 10, 1.75))).toEqual({ look: 'lit', rung: 'lit' })
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

describe('whose fault a slow window is', () => {
  it('blames the stage when its work cannot fit the frame', () => {
    expect(ours(22, 33)).toBe(true)
    expect(ours(120, 130)).toBe(true)
    expect(ours(7, 11)).toBe(true)
  })

  it('holds on a display capped at 30 Hz with the stage mostly idle', () => {
    expect(ours(5, 33)).toBe(false)
    expect(ours(12, 33)).toBe(false)
  })
})

describe('when Auto acts', () => {
  const start = 0
  it('never in the first seconds, and only on a second slow window in a row', () => {
    expect(strike({ count: 0, at: 0 }, GRACE_MS - 100, start, 30).act).toBe(false)
    const first = strike({ count: 0, at: 0 }, GRACE_MS + 1000, start, 30)
    expect(first.act).toBe(false)
    expect(strike(first.strikes, GRACE_MS + 2500, start, 30).act).toBe(true)
  })

  it('starts counting again after a smooth stretch', () => {
    const first = strike({ count: 0, at: 0 }, GRACE_MS + 1000, start, 30)
    expect(strike(first.strikes, GRACE_MS + 9000, start, 30).act).toBe(false)
  })

  it('counts windows in a row however long a slow device takes to fill one', () => {
    const first = strike({ count: 0, at: 0 }, GRACE_MS + 1000, start, 50)
    expect(first.act).toBe(false)
    expect(strike(first.strikes, GRACE_MS + 1000 + 90 * 50, start, 50).act).toBe(true)
  })

  it('acts on the first window when frames crawl', () => {
    expect(strike({ count: 0, at: 0 }, GRACE_MS + 1000, start, CRAWL_MS + 10).act).toBe(true)
  })
})

describe('what Auto remembers', () => {
  const now = 1_000_000_000_000
  const day = 24 * 3600 * 1000
  it('reads back a lit rung for a week, the toon look for a day, and forgets broken ones', () => {
    expect(parseFit(JSON.stringify({ look: 'lit', rung: 'ao', at: now - 3 * day }), now)).toEqual({ look: 'lit', rung: 'ao' })
    expect(parseFit(JSON.stringify({ look: 'toon', at: now - 1000 }), now)).toEqual({ look: 'toon' })
    expect(parseFit(JSON.stringify({ look: 'toon', at: now - 2 * day }), now)).toBeNull()
    expect(parseFit(JSON.stringify({ look: 'lit', rung: 'ao', at: now - 8 * 24 * 3600 * 1000 }), now)).toBeNull()
    expect(parseFit(JSON.stringify({ look: 'lit', rung: 'ultra', at: now }), now)).toBeNull()
    expect(parseFit('{', now)).toBeNull()
    expect(parseFit(null, now)).toBeNull()
  })
})
