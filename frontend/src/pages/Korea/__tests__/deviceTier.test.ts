import { describe, it, expect, beforeEach } from 'vitest'
import {
  detectTier,
  defaultPrefsForTier,
  loadEffectPrefs,
  saveEffectPrefs,
} from '../deviceTier'

describe('deviceTier', () => {
  beforeEach(() => {
    try { window.localStorage.clear() } catch { /* noop */ }
  })

  describe('detectTier', () => {
    it('returns one of low/medium/high', () => {
      const tier = detectTier()
      expect(['low', 'medium', 'high']).toContain(tier)
    })
  })

  describe('defaultPrefsForTier', () => {
    it('forces fog + god rays off on low tier', () => {
      const prefs = defaultPrefsForTier('low')
      expect(prefs.fog).toBe(false)
      expect(prefs.godRays).toBe(false)
      // Grade is compositor-only, on by default everywhere.
      expect(prefs.grade).toBe(true)
    })

    it('enables fog but not god rays on medium tier', () => {
      const prefs = defaultPrefsForTier('medium')
      expect(prefs.fog).toBe(true)
      expect(prefs.godRays).toBe(false)
      expect(prefs.grade).toBe(true)
    })

    it('enables both fog and god rays on high tier', () => {
      const prefs = defaultPrefsForTier('high')
      expect(prefs.fog).toBe(true)
      expect(prefs.godRays).toBe(true)
      expect(prefs.grade).toBe(true)
    })

    it('treats prefers-reduced-motion as a hard low tier for defaults', () => {
      const prefs = defaultPrefsForTier('high', true)
      expect(prefs.fog).toBe(false)
      expect(prefs.godRays).toBe(false)
      // Grade is still on — it's not motion, just a static tint.
      expect(prefs.grade).toBe(true)
    })
  })

  describe('loadEffectPrefs / saveEffectPrefs', () => {
    it('returns tier defaults when nothing is persisted', () => {
      const prefs = loadEffectPrefs('high')
      expect(prefs).toEqual(defaultPrefsForTier('high'))
    })

    it('round-trips a saved override and merges over defaults', () => {
      saveEffectPrefs({ fog: false, godRays: true, grade: false })
      const prefs = loadEffectPrefs('low')
      expect(prefs.fog).toBe(false)
      expect(prefs.godRays).toBe(true)
      expect(prefs.grade).toBe(false)
    })

    it('falls back to defaults on malformed storage', () => {
      try { window.localStorage.setItem('korea-d3d-effects', 'not-json') } catch { /* noop */ }
      const prefs = loadEffectPrefs('medium')
      expect(prefs).toEqual(defaultPrefsForTier('medium'))
    })
  })
})
