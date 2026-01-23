import { BREATH_PHASES, TECHNIQUE_IDS, type BreathPhase, type TechniqueId } from './constants'

export interface PhaseConfig {
  phase: BreathPhase
  duration: number // in seconds
}

export interface BreathingProtocol {
  id: TechniqueId
  name: string
  description: string
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
    description: 'Equal duration inhale, hold, exhale, hold pattern. Used by Navy SEALs for stress management.',
    purpose: 'Parasympathetic activation and recovery',
    defaultRounds: 4,
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
    description: 'Progressive breath holds to increase CO2 tolerance. Directly impacts VO2Max.',
    purpose: 'Increase CO2 tolerance for better oxygen utilization',
    defaultRounds: 8,
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
    description: 'Deep, rapid breaths followed by breath retention. Similar to Wim Hof method.',
    purpose: 'Increase oxygen saturation before holds',
    defaultRounds: 3,
    phases: [
      // 30 power breaths (we'll handle this with a repeat count)
      { phase: BREATH_PHASES.INHALE, duration: 2 },
      { phase: BREATH_PHASES.EXHALE, duration: 2 },
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
