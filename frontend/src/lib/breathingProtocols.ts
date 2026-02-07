import { BREATH_PHASES, TECHNIQUE_IDS, type BreathPhase, type TechniqueId } from './constants'

export interface PhaseConfig {
  phase: BreathPhase
  duration: number // in seconds
}

export interface BreathingProtocol {
  id: TechniqueId
  name: string
  description: string
  science: string
  purpose: string
  defaultRounds: number
  phases: PhaseConfig[]
  progressiveHold?: boolean // For CO2 tables - hold times increase each round
  holdIncrement?: number // Seconds to add per round for progressive holds
}

export const breathingProtocols: Record<TechniqueId, BreathingProtocol> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    id: TECHNIQUE_IDS.BOX_BREATHING,
    name: 'Box Breathing',
    description: 'Equal-duration 4-second phases at 3.75 breaths/min. Used by Navy SEALs and adopted in clinical settings for acute stress management.',
    science: 'The equal-phase pattern synchronizes respiratory rhythm with the baroreflex, shifting autonomic balance toward parasympathetic dominance. Breath holds raise CO2 slightly, triggering a cardioinhibitory response that lowers heart rate. Studies show reduced cortisol (~23% after 1 month of consistent practice), lower pre-performance anxiety (~35%), and increased heart rate variability.',
    purpose: 'Calm the nervous system under stress',
    defaultRounds: 19, // 19 × 16s = 304s ≈ 5 min (systematic review: <5 min sessions 67% ineffective)
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 4 },
      { phase: BREATH_PHASES.HOLD_IN, duration: 4 },
      { phase: BREATH_PHASES.EXHALE, duration: 4 },
      { phase: BREATH_PHASES.HOLD_OUT, duration: 4 },
    ],
  },

  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    id: TECHNIQUE_IDS.CO2_TOLERANCE,
    name: 'CO2 Tolerance Table',
    description: 'Progressive breath holds that increase by 5s each round, training your body to tolerate higher CO2 levels. Adapted from freediving CO2 table protocols.',
    science: 'Holding your breath raises blood CO2, which normally triggers the urge to breathe. Progressive exposure trains chemoreceptors to tolerate higher levels, reducing premature breathing. Via the Bohr effect, higher CO2 tolerance improves oxygen extraction per breath. A study on trained cyclists showed a 23.6W increase in functional threshold power after 6 weeks of nasal/apnea breathing protocols, with CO2 tolerance strongly correlated to lower state anxiety.',
    purpose: 'Build CO2 tolerance for performance and composure',
    defaultRounds: 8, // 8 rounds = 388s ≈ 6.5 min (already above 5 min minimum)
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 3 },
      { phase: BREATH_PHASES.HOLD_IN, duration: 15 }, // Starting hold, increases each round
      { phase: BREATH_PHASES.EXHALE, duration: 3 },
      { phase: BREATH_PHASES.REST, duration: 10 },
    ],
    progressiveHold: true,
    holdIncrement: 5, // Add 5 seconds to hold each round
  },

  [TECHNIQUE_IDS.POWER_BREATHING]: {
    id: TECHNIQUE_IDS.POWER_BREATHING,
    name: 'Power Breathing',
    description: '30 rapid deep breaths at 15 breaths/min. Based on the Wim Hof method hyperventilation protocol studied in clinical trials (Kox et al., 2014).',
    science: 'Controlled hyperventilation lowers blood CO2 and shifts pH alkaline, triggering vasoconstriction and adrenaline release. A landmark PNAS trial showed trained practitioners could voluntarily activate the sympathetic nervous system and suppress pro-inflammatory cytokines (TNF-α, IL-6, IL-8) while increasing anti-inflammatory IL-10. This technique increases alertness, pain tolerance, and hypoxia resistance.',
    purpose: 'Sympathetic activation and immune modulation',
    defaultRounds: 30, // Standard Wim Hof: 30 breaths per round (30 × 4s = 120s = 2 min)
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 2 },
      { phase: BREATH_PHASES.EXHALE, duration: 2 },
    ],
  },

  [TECHNIQUE_IDS.CYCLIC_SIGHING]: {
    id: TECHNIQUE_IDS.CYCLIC_SIGHING,
    name: 'Cyclic Sighing',
    description: 'Double inhale through the nose, then a long slow exhale at ~6 breaths/min. Outperformed mindfulness meditation for anxiety reduction in a Stanford RCT (Balban et al., 2023).',
    science: 'The double inhale maximally inflates collapsed alveoli, optimizing CO2 offloading. The prolonged exhale increases venous return and activates vagal baroreceptor pathways, shifting into parasympathetic dominance. In a 111-person randomized controlled trial, 5 min/day of cyclic sighing produced greater improvement in positive affect and lower respiratory rate than box breathing, hyperventilation, or mindfulness meditation — with benefits compounding over consecutive days of practice.',
    purpose: 'De-stress and reduce anxiety',
    defaultRounds: 30, // ~5 min session (10s per cycle × 30 = 300s) — matches the RCT protocol
    phases: [
      { phase: BREATH_PHASES.INHALE, duration: 3 },       // First inhale – fill lungs
      { phase: BREATH_PHASES.DEEP_INHALE, duration: 2 },  // Second sip – maximize expansion
      { phase: BREATH_PHASES.EXHALE, duration: 5 },       // Slow extended exhale (~1:2 inhale:exhale emphasis)
    ],
  },
}

export interface SessionConfig {
  techniqueId: TechniqueId
  rounds: number
  customPhaseDurations?: Partial<Record<BreathPhase, number>>
}

export function getProtocol(id: TechniqueId): BreathingProtocol {
  return breathingProtocols[id]
}

export function calculateSessionDuration(config: SessionConfig): number {
  const protocol = getProtocol(config.techniqueId)
  let totalSeconds = 0

  for (let round = 0; round < config.rounds; round++) {
    for (const phaseConfig of protocol.phases) {
      let duration = config.customPhaseDurations?.[phaseConfig.phase] ?? phaseConfig.duration

      // Apply progressive hold increment for CO2 tolerance
      if (protocol.progressiveHold && phaseConfig.phase === BREATH_PHASES.HOLD_IN) {
        duration += round * (protocol.holdIncrement ?? 0)
      }

      totalSeconds += duration
    }
  }

  return totalSeconds
}

export function getPhaseForRound(
  protocol: BreathingProtocol,
  round: number,
  phaseIndex: number,
  customDurations?: Partial<Record<BreathPhase, number>>
): PhaseConfig {
  const basePhase = protocol.phases[phaseIndex]
  let duration = customDurations?.[basePhase.phase] ?? basePhase.duration

  // Apply progressive hold for CO2 tolerance tables
  if (protocol.progressiveHold && basePhase.phase === BREATH_PHASES.HOLD_IN) {
    duration += round * (protocol.holdIncrement ?? 0)
  }

  return {
    phase: basePhase.phase,
    duration,
  }
}
