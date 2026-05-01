// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  breathingProtocols,
  getProtocolCatalog,
  protocolOrder,
  getProtocol,
  isTechniqueId,
  calculateSessionDuration,
  applyCustomPhaseDurations,
  hasCustomPhaseDurations,
  getPhaseForRound,
} from '../breathingProtocols'
import { BREATH_PHASES, TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'

describe('breathingProtocols', () => {
  const allTechniqueIds = Object.values(TECHNIQUE_IDS) as TechniqueId[]

  it('has an entry for every technique ID', () => {
    for (const id of allTechniqueIds) {
      expect(breathingProtocols[id]).toBeDefined()
    }
  })

  it('catalog order includes every technique exactly once', () => {
    expect(new Set(protocolOrder).size).toBe(allTechniqueIds.length)
    expect(protocolOrder).toEqual(expect.arrayContaining(allTechniqueIds))
    expect(getProtocolCatalog().map((protocol) => protocol.id)).toEqual(protocolOrder)
  })

  it('each protocol has all required fields', () => {
    for (const id of allTechniqueIds) {
      const protocol = breathingProtocols[id]
      expect(protocol.id).toBe(id)
      expect(typeof protocol.name).toBe('string')
      expect(protocol.name.length).toBeGreaterThan(0)
      expect(typeof protocol.shortName).toBe('string')
      expect(protocol.shortName.length).toBeGreaterThan(0)
      expect(typeof protocol.description).toBe('string')
      expect(typeof protocol.science).toBe('string')
      expect(protocol.science.length).toBeGreaterThan(0)
      expect(typeof protocol.evidence).toBe('string')
      expect(['strong', 'promising', 'traditional']).toContain(protocol.evidenceLevel)
      expect(protocol.citations.length).toBeGreaterThan(0)
      for (const citation of protocol.citations) {
        expect(typeof citation.authors).toBe('string')
        expect(citation.authors.length).toBeGreaterThan(0)
        expect(typeof citation.title).toBe('string')
        expect(citation.title.length).toBeGreaterThan(0)
        expect(typeof citation.source).toBe('string')
        expect(citation.source.length).toBeGreaterThan(0)
        expect(citation.year).toBeGreaterThanOrEqual(1900)
        expect(citation.url).toMatch(/^https:\/\//)
      }
      expect(typeof protocol.purpose).toBe('string')
      expect(['calm', 'sleep', 'performance', 'recovery', 'focus']).toContain(protocol.category)
      expect(['gentle', 'moderate', 'advanced']).toContain(protocol.intensity)
      expect(protocol.bestFor.length).toBeGreaterThan(0)
      expect(protocol.breathsPerMinute).toBeGreaterThan(0)
      expect(typeof protocol.defaultRounds).toBe('number')
      expect(protocol.defaultRounds).toBeGreaterThan(0)
      expect(Array.isArray(protocol.phases)).toBe(true)
      expect(protocol.phases.length).toBeGreaterThan(0)
    }
  })

  it('each phase has a valid phase name and positive duration', () => {
    const validPhases = Object.values(BREATH_PHASES)
    for (const id of allTechniqueIds) {
      const protocol = breathingProtocols[id]
      for (const phaseConfig of protocol.phases) {
        expect(validPhases).toContain(phaseConfig.phase)
        expect(phaseConfig.duration).toBeGreaterThan(0)
      }
    }
  })

  it('box breathing has 4 equal phases of 4 seconds', () => {
    const box = breathingProtocols[TECHNIQUE_IDS.BOX_BREATHING]
    expect(box.phases).toHaveLength(4)
    for (const phase of box.phases) {
      expect(phase.duration).toBe(4)
    }
    expect(box.phases[0].phase).toBe(BREATH_PHASES.INHALE)
    expect(box.phases[1].phase).toBe(BREATH_PHASES.HOLD_IN)
    expect(box.phases[2].phase).toBe(BREATH_PHASES.EXHALE)
    expect(box.phases[3].phase).toBe(BREATH_PHASES.HOLD_OUT)
  })

  it('CO2 tolerance has progressive hold enabled with a 5s increment', () => {
    const co2 = breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE]
    expect(co2.progressiveHold).toBe(true)
    expect(co2.holdIncrement).toBe(5)
  })

  it('power breathing has only inhale and exhale phases', () => {
    const power = breathingProtocols[TECHNIQUE_IDS.POWER_BREATHING]
    expect(power.phases).toHaveLength(2)
    expect(power.phases[0].phase).toBe(BREATH_PHASES.INHALE)
    expect(power.phases[1].phase).toBe(BREATH_PHASES.EXHALE)
  })

  it('advanced protocols include an active safety checklist', () => {
    const advancedProtocols = allTechniqueIds
      .map((id) => breathingProtocols[id])
      .filter((protocol) => protocol.intensity === 'advanced')

    expect(advancedProtocols.length).toBeGreaterThan(0)
    for (const protocol of advancedProtocols) {
      expect(protocol.safetyNotice).toBeTruthy()
      expect(protocol.contraindications?.length).toBeGreaterThanOrEqual(2)
      expect(protocol.safetyChecklist?.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps public evidence copy free of quantitative and medical overclaims', () => {
    const publicEvidenceCopy = getProtocolCatalog()
      .flatMap((protocol) => [
        protocol.description,
        protocol.science,
        protocol.evidence,
        protocol.purpose,
        ...protocol.bestFor,
      ])
      .join(' ')

    expect(publicEvidenceCopy).not.toMatch(/~?\d+(?:\.\d+)?\s*%/)
    expect(publicEvidenceCopy).not.toMatch(/\b\d+(?:\.\d+)?\s*W\b/)
    expect(publicEvidenceCopy).not.toMatch(/\bsuppress(?:es|ing|ed)? pro-inflammatory cytokines\b/i)
    expect(publicEvidenceCopy).not.toMatch(/\bimmune modulation\b/i)
    expect(publicEvidenceCopy).not.toMatch(/\bhypoxia resistance\b/i)
    expect(publicEvidenceCopy).not.toMatch(/\bpain tolerance\b/i)
  })

  it('qualifies limited evidence behind advanced protocol claims', () => {
    const co2 = breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE]
    const power = breathingProtocols[TECHNIQUE_IDS.POWER_BREATHING]

    expect(co2.science).toMatch(/small conference study/i)
    expect(co2.science).toMatch(/not a guaranteed endurance boost/i)
    expect(power.science).toMatch(/multi-component program/i)
    expect(power.science).toMatch(/does not show that an app session independently treats inflammation or modulates immunity/i)
    expect(power.purpose).toBe('Sympathetic activation and alertness')
  })

  it('cyclic sighing has inhale, deep inhale, and exhale phases', () => {
    const sighing = breathingProtocols[TECHNIQUE_IDS.CYCLIC_SIGHING]
    expect(sighing.phases).toHaveLength(3)
    expect(sighing.phases[0].phase).toBe(BREATH_PHASES.INHALE)
    expect(sighing.phases[0].duration).toBe(3)
    expect(sighing.phases[1].phase).toBe(BREATH_PHASES.DEEP_INHALE)
    expect(sighing.phases[1].duration).toBe(2)
    expect(sighing.phases[2].phase).toBe(BREATH_PHASES.EXHALE)
    expect(sighing.phases[2].duration).toBe(5)
  })

  it('cyclic sighing defaults to 30 rounds for ~5 minute session', () => {
    const sighing = breathingProtocols[TECHNIQUE_IDS.CYCLIC_SIGHING]
    expect(sighing.defaultRounds).toBe(30)
  })

  it('diaphragmatic reset is a gentle hold-free belly breathing protocol', () => {
    const diaphragmatic = breathingProtocols[TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING]

    expect(diaphragmatic.intensity).toBe('gentle')
    expect(diaphragmatic.evidenceLevel).toBe('promising')
    expect(diaphragmatic.phases).toEqual([
      { phase: BREATH_PHASES.INHALE, duration: 4 },
      { phase: BREATH_PHASES.EXHALE, duration: 4 },
    ])
    expect(diaphragmatic.citations.map((citation) => citation.url)).toContain(
      'https://doi.org/10.3389/fpsyg.2017.00874',
    )
  })
})

describe('getProtocol', () => {
  it('returns the correct protocol for each technique ID', () => {
    expect(getProtocol(TECHNIQUE_IDS.BOX_BREATHING).name).toBe('Box Breathing')
    expect(getProtocol(TECHNIQUE_IDS.CO2_TOLERANCE).name).toBe('CO2 Tolerance Table')
    expect(getProtocol(TECHNIQUE_IDS.POWER_BREATHING).name).toBe('Power Breathing')
    expect(getProtocol(TECHNIQUE_IDS.CYCLIC_SIGHING).name).toBe('Cyclic Sighing')
    expect(getProtocol(TECHNIQUE_IDS.RESONANCE_BREATHING).name).toBe('Resonance Breathing')
    expect(getProtocol(TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING).name).toBe('Diaphragmatic Reset')
    expect(getProtocol(TECHNIQUE_IDS.EXTENDED_EXHALE).name).toBe('Extended Exhale')
    expect(getProtocol(TECHNIQUE_IDS.FOUR_SEVEN_EIGHT).name).toBe('4-7-8 Downshift')
    expect(getProtocol(TECHNIQUE_IDS.PURSED_LIP_RECOVERY).name).toBe('Pursed-Lip Recovery')
  })

  it('returns the same object as the breathingProtocols map', () => {
    expect(getProtocol(TECHNIQUE_IDS.BOX_BREATHING)).toBe(
      breathingProtocols[TECHNIQUE_IDS.BOX_BREATHING]
    )
  })
})

describe('isTechniqueId', () => {
  it('validates known technique IDs', () => {
    expect(isTechniqueId(TECHNIQUE_IDS.CYCLIC_SIGHING)).toBe(true)
    expect(isTechniqueId('not-a-technique')).toBe(false)
    expect(isTechniqueId(null)).toBe(false)
  })
})

describe('calculateSessionDuration', () => {
  it('calculates box breathing duration: 4 phases x 4s x N rounds', () => {
    // 4 phases * 4s = 16s per round

    // 1 round = 16s
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        rounds: 1,
      })
    ).toBe(16)

    // 10 rounds = 160s
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        rounds: 10,
      })
    ).toBe(160)

    // 19 rounds (default) = 304s ≈ 5 min
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        rounds: 19,
      })
    ).toBe(304)
  })

  it('calculates CO2 tolerance duration with progressive holds', () => {
    // Phases per round: inhale(3) + hold_in(15 + round*5) + exhale(3) + rest(10)
    // Round 0: 3 + 15 + 3 + 10 = 31
    // Round 1: 3 + 20 + 3 + 10 = 36
    // Round 2: 3 + 25 + 3 + 10 = 41
    // ...
    // Round N: 3 + (15 + N*5) + 3 + 10 = 31 + N*5

    // 1 round (round 0 only): 31
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
        rounds: 1,
      })
    ).toBe(31)

    // 2 rounds: 31 + 36 = 67
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
        rounds: 2,
      })
    ).toBe(67)

    // 8 rounds (default): sum of (31 + i*5) for i=0..7
    // = 8*31 + 5*(0+1+2+3+4+5+6+7) = 248 + 5*28 = 248 + 140 = 388
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
        rounds: 8,
      })
    ).toBe(388)
  })

  it('calculates power breathing duration', () => {
    // 2 phases: inhale(2) + exhale(2) = 4s per round

    // 1 round: 4s
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.POWER_BREATHING,
        rounds: 1,
      })
    ).toBe(4)

    // 30 rounds (default, standard Wim Hof 30-breath set): 120s
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.POWER_BREATHING,
        rounds: 30,
      })
    ).toBe(120)
  })

  it('calculates cyclic sighing duration', () => {
    // 3 phases: inhale(3) + deep_inhale(2) + exhale(5) = 10s per round
    // 30 rounds (default): 300s = 5 minutes
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.CYCLIC_SIGHING,
        rounds: 30,
      })
    ).toBe(300)

    // 1 round: 10s
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.CYCLIC_SIGHING,
        rounds: 1,
      })
    ).toBe(10)
  })

  it('calculates added protocol durations', () => {
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
        rounds: 30,
      })
    ).toBe(300)

    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING,
        rounds: 38,
      })
    ).toBe(304)

    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.EXTENDED_EXHALE,
        rounds: 30,
      })
    ).toBe(300)

    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.FOUR_SEVEN_EIGHT,
        rounds: 16,
      })
    ).toBe(304)

    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.PURSED_LIP_RECOVERY,
        rounds: 50,
      })
    ).toBe(300)
  })

  it('applies custom phase durations', () => {
    // Box breathing with custom inhale of 6s instead of 4s
    // Per round: 6 + 4 + 4 + 4 = 18, 2 rounds = 36
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        rounds: 2,
        customPhaseDurations: { [BREATH_PHASES.INHALE]: 6 },
      })
    ).toBe(36)
  })

  it('applies custom durations together with progressive holds on CO2 tolerance', () => {
    // Custom hold_in starting at 20 instead of 15, increment still 5
    // Round 0: 3 + (20 + 0*5) + 3 + 10 = 36
    // Round 1: 3 + (20 + 1*5) + 3 + 10 = 41
    // Total: 36 + 41 = 77
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
        rounds: 2,
        customPhaseDurations: { [BREATH_PHASES.HOLD_IN]: 20 },
      })
    ).toBe(77)
  })

  it('applies custom phase durations for display without mutating the source protocol', () => {
    const resonance = breathingProtocols[TECHNIQUE_IDS.RESONANCE_BREATHING]

    expect(hasCustomPhaseDurations(resonance)).toBe(false)
    expect(hasCustomPhaseDurations(resonance, {
      [BREATH_PHASES.INHALE]: 5,
    })).toBe(false)
    expect(hasCustomPhaseDurations(resonance, {
      [BREATH_PHASES.INHALE]: 6,
    })).toBe(true)

    const customized = applyCustomPhaseDurations(resonance, {
      [BREATH_PHASES.INHALE]: 6,
    })

    expect(customized).not.toBe(resonance)
    expect(customized.phases).toEqual([
      { phase: BREATH_PHASES.INHALE, duration: 6 },
      { phase: BREATH_PHASES.EXHALE, duration: 5 },
    ])
    expect(resonance.phases[0].duration).toBe(5)
  })

  it('returns 0 for 0 rounds', () => {
    expect(
      calculateSessionDuration({
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        rounds: 0,
      })
    ).toBe(0)
  })
})

describe('getPhaseForRound', () => {
  it('returns the correct phase and duration for box breathing', () => {
    const protocol = getProtocol(TECHNIQUE_IDS.BOX_BREATHING)

    const inhale = getPhaseForRound(protocol, 0, 0)
    expect(inhale.phase).toBe(BREATH_PHASES.INHALE)
    expect(inhale.duration).toBe(4)

    const holdIn = getPhaseForRound(protocol, 0, 1)
    expect(holdIn.phase).toBe(BREATH_PHASES.HOLD_IN)
    expect(holdIn.duration).toBe(4)

    const exhale = getPhaseForRound(protocol, 0, 2)
    expect(exhale.phase).toBe(BREATH_PHASES.EXHALE)
    expect(exhale.duration).toBe(4)

    const holdOut = getPhaseForRound(protocol, 0, 3)
    expect(holdOut.phase).toBe(BREATH_PHASES.HOLD_OUT)
    expect(holdOut.duration).toBe(4)
  })

  it('returns the same duration across rounds for non-progressive protocols', () => {
    const protocol = getProtocol(TECHNIQUE_IDS.BOX_BREATHING)

    for (let round = 0; round < 5; round++) {
      const phase = getPhaseForRound(protocol, round, 0)
      expect(phase.duration).toBe(4)
    }
  })

  it('increases hold_in duration per round for CO2 tolerance', () => {
    const protocol = getProtocol(TECHNIQUE_IDS.CO2_TOLERANCE)

    // hold_in is phase index 1, base duration 15, increment 5
    expect(getPhaseForRound(protocol, 0, 1).duration).toBe(15)
    expect(getPhaseForRound(protocol, 1, 1).duration).toBe(20)
    expect(getPhaseForRound(protocol, 2, 1).duration).toBe(25)
    expect(getPhaseForRound(protocol, 3, 1).duration).toBe(30)
    expect(getPhaseForRound(protocol, 7, 1).duration).toBe(50)
  })

  it('does not increase non-hold phases for CO2 tolerance', () => {
    const protocol = getProtocol(TECHNIQUE_IDS.CO2_TOLERANCE)

    // inhale (index 0), exhale (index 2), rest (index 3) should stay constant
    for (let round = 0; round < 5; round++) {
      expect(getPhaseForRound(protocol, round, 0).duration).toBe(3) // inhale
      expect(getPhaseForRound(protocol, round, 2).duration).toBe(3) // exhale
      expect(getPhaseForRound(protocol, round, 3).duration).toBe(10) // rest
    }
  })

  it('applies custom durations', () => {
    const protocol = getProtocol(TECHNIQUE_IDS.BOX_BREATHING)

    const phase = getPhaseForRound(protocol, 0, 0, {
      [BREATH_PHASES.INHALE]: 8,
    })
    expect(phase.phase).toBe(BREATH_PHASES.INHALE)
    expect(phase.duration).toBe(8)
  })

  it('applies custom durations with progressive holds on CO2 tolerance', () => {
    const protocol = getProtocol(TECHNIQUE_IDS.CO2_TOLERANCE)

    // Custom hold_in base of 20, round 3 => 20 + 3*5 = 35
    const phase = getPhaseForRound(protocol, 3, 1, {
      [BREATH_PHASES.HOLD_IN]: 20,
    })
    expect(phase.phase).toBe(BREATH_PHASES.HOLD_IN)
    expect(phase.duration).toBe(35)
  })
})
