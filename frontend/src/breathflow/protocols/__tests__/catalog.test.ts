import { describe, expect, it } from 'vitest'
import { BREATH_PHASES } from '@/lib/constants'
import {
  ADVANCED_TECHNIQUE_IDS,
  DEFAULT_TECHNIQUE_ID,
  getProtocol,
  isAdvancedProtocol,
  PROTOCOLS,
} from '../catalog'

// Authoritative spec table: id, category, intensity, evidence, default rounds, phases.
const SPEC_TABLE = [
  ['cyclic_sighing', 'calm', 'gentle', 'strong', 30, [['inhale', 3], ['deep_inhale', 2], ['exhale', 5]]],
  ['resonance_breathing', 'calm', 'gentle', 'strong', 30, [['inhale', 5], ['exhale', 5]]],
  ['diaphragmatic_breathing', 'calm', 'gentle', 'promising', 38, [['inhale', 4], ['exhale', 4]]],
  ['extended_exhale', 'calm', 'gentle', 'strong', 30, [['inhale', 4], ['exhale', 6]]],
  ['box_breathing', 'focus', 'moderate', 'promising', 19, [['inhale', 4], ['hold_in', 4], ['exhale', 4], ['hold_out', 4]]],
  ['four_seven_eight', 'sleep', 'moderate', 'promising', 16, [['inhale', 4], ['hold_in', 7], ['exhale', 8]]],
  ['co2_tolerance', 'performance', 'advanced', 'promising', 8, [['inhale', 3], ['hold_in', 15], ['exhale', 3], ['rest', 10]]],
  ['pursed_lip_recovery', 'recovery', 'gentle', 'strong', 50, [['inhale', 2], ['exhale', 4]]],
  ['power_breathing', 'performance', 'advanced', 'promising', 30, [['inhale', 2], ['exhale', 2]]],
] as const

describe('protocol catalog', () => {
  it('contains exactly the nine spec techniques in spec order', () => {
    expect(PROTOCOLS.map((p) => p.id)).toEqual(SPEC_TABLE.map(([id]) => id))
  })

  it.each(SPEC_TABLE)('%s matches the spec row', (id, category, intensity, evidence, rounds, phases) => {
    const protocol = getProtocol(id)
    expect(protocol.id).toBe(id)
    expect(protocol.category).toBe(category)
    expect(protocol.intensity).toBe(intensity)
    expect(protocol.evidenceLevel).toBe(evidence)
    expect(protocol.defaultRounds).toBe(rounds)
    expect(protocol.phases.map((p) => [p.phase, p.seconds])).toEqual(phases.map((p) => [...p]))
  })

  it('gives every protocol name, descriptions, purpose, bestFor, cadence and at least one full citation', () => {
    for (const protocol of PROTOCOLS) {
      expect(protocol.name.length).toBeGreaterThan(0)
      expect(protocol.description.length).toBeGreaterThan(0)
      expect(protocol.science.length).toBeGreaterThan(50)
      expect(protocol.evidenceLabel.length).toBeGreaterThan(0)
      expect(protocol.purpose.length).toBeGreaterThan(0)
      expect(protocol.bestFor.length).toBeGreaterThan(0)
      expect(protocol.breathsPerMinute).toBeGreaterThan(0)
      expect(protocol.citations.length).toBeGreaterThan(0)
      for (const citation of protocol.citations) {
        expect(citation.authors.length).toBeGreaterThan(0)
        expect(citation.title.length).toBeGreaterThan(0)
        expect(citation.source.length).toBeGreaterThan(0)
        expect(citation.year).toBeGreaterThan(1900)
        expect(citation.url).toMatch(/^https:\/\//)
      }
    }
  })

  it('safety-gates exactly co2_tolerance and power_breathing', () => {
    expect(ADVANCED_TECHNIQUE_IDS).toEqual(['co2_tolerance', 'power_breathing'])
    for (const protocol of PROTOCOLS) {
      const advanced = protocol.id === 'co2_tolerance' || protocol.id === 'power_breathing'
      expect(isAdvancedProtocol(protocol)).toBe(advanced)
      if (advanced) {
        expect(protocol.safetyNotice).toBeTruthy()
        expect(protocol.contraindications?.length).toBeGreaterThanOrEqual(3)
        expect(protocol.safetyChecklist?.length).toBeGreaterThanOrEqual(3)
      } else {
        expect(protocol.safetyChecklist).toBeUndefined()
      }
    }
  })

  it('only co2_tolerance has a progressive hold increment of 5', () => {
    for (const protocol of PROTOCOLS) {
      if (protocol.id === 'co2_tolerance') {
        expect(protocol.holdIncrementSeconds).toBe(5)
      } else {
        expect(protocol.holdIncrementSeconds).toBeUndefined()
      }
    }
  })

  it('falls back to Cyclic Sighing for unknown techniques', () => {
    expect(DEFAULT_TECHNIQUE_ID).toBe('cyclic_sighing')
    expect(getProtocol('not_a_technique').id).toBe('cyclic_sighing')
    expect(getProtocol(null).id).toBe('cyclic_sighing')
    expect(getProtocol(undefined).id).toBe('cyclic_sighing')
  })

  it('default Cyclic Sighing session is about 5 minutes', () => {
    const sighing = getProtocol('cyclic_sighing')
    const cycle = sighing.phases.reduce((sum, p) => sum + p.seconds, 0)
    expect(cycle * sighing.defaultRounds).toBe(300)
  })

  it('uses only the six known breath phases', () => {
    const known = new Set(Object.values(BREATH_PHASES))
    for (const protocol of PROTOCOLS) {
      for (const { phase, seconds } of protocol.phases) {
        expect(known.has(phase)).toBe(true)
        expect(Number.isInteger(seconds)).toBe(true)
        expect(seconds).toBeGreaterThan(0)
      }
    }
  })
})
