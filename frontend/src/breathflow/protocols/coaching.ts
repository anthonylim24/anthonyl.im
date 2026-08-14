import { BREATH_PHASES, TECHNIQUE_IDS, type BreathPhase, type TechniqueId } from '@/lib/constants'

/** Shown in the ready state before the first breath. */
export const READY_CUE = 'Sit still. Next breath, easy.'

/** Persistent cue shown throughout advanced (safety-gated) sessions. */
export const ADVANCED_SAFETY_CUE = 'Stay seated. Stop before strain or lightheadedness.'

type PhaseCues = Partial<Record<BreathPhase, string>>

const CUES: Record<TechniqueId, PhaseCues> = {
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: {
    [BREATH_PHASES.INHALE]: 'Breathe in through your nose.',
    [BREATH_PHASES.DEEP_INHALE]: 'Sip in a little more air.',
    [BREATH_PHASES.EXHALE]: 'Sigh it all out, slow through the mouth.',
  },
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'In gently through the nose.',
    [BREATH_PHASES.EXHALE]: 'Out just as slowly. No push.',
  },
  [TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Send the breath low. Belly rises.',
    [BREATH_PHASES.EXHALE]: 'Let the belly fall on its own.',
  },
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: {
    [BREATH_PHASES.INHALE]: 'Easy breath in through the nose.',
    [BREATH_PHASES.EXHALE]: 'Stretch the exhale long and soft.',
  },
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Up the side. Breathe in.',
    [BREATH_PHASES.HOLD_IN]: 'Hold. Shoulders stay soft.',
    [BREATH_PHASES.EXHALE]: 'Down the side. Breathe out.',
    [BREATH_PHASES.HOLD_OUT]: 'Stay empty. Stay easy.',
  },
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: {
    [BREATH_PHASES.INHALE]: 'In quietly through the nose.',
    [BREATH_PHASES.HOLD_IN]: 'Hold without straining.',
    [BREATH_PHASES.EXHALE]: 'Slow whoosh out through the mouth.',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    [BREATH_PHASES.INHALE]: 'Small, quiet breath in.',
    [BREATH_PHASES.HOLD_IN]: 'Hold. Relax into the air hunger.',
    [BREATH_PHASES.EXHALE]: 'Release the hold gently.',
    [BREATH_PHASES.REST]: 'Breathe normally. Recover.',
  },
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: {
    [BREATH_PHASES.INHALE]: 'Quick sip in through the nose.',
    [BREATH_PHASES.EXHALE]: 'Slow out through pursed lips.',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Full breath in. Fill up.',
    [BREATH_PHASES.EXHALE]: 'Let it go. Fast and loose.',
  },
}

const FALLBACK_CUES: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]: 'Breathe in.',
  [BREATH_PHASES.DEEP_INHALE]: 'Sip in a little more.',
  [BREATH_PHASES.HOLD_IN]: 'Hold, relaxed.',
  [BREATH_PHASES.EXHALE]: 'Breathe out.',
  [BREATH_PHASES.HOLD_OUT]: 'Rest empty.',
  [BREATH_PHASES.REST]: 'Breathe normally.',
}

export function getCoachingCue(techniqueId: TechniqueId, phase: BreathPhase): string {
  return CUES[techniqueId]?.[phase] ?? FALLBACK_CUES[phase]
}
