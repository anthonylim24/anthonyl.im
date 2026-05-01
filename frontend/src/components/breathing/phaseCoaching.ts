import { BREATH_PHASES, type BreathPhase, type TechniqueId, TECHNIQUE_IDS } from '@/lib/constants'

const READY_CUE = 'Settle into a stable position and let your next breath be easy.'

const DEFAULT_PHASE_CUES = {
  [BREATH_PHASES.INHALE]: 'Draw the breath in quietly, without lifting the shoulders.',
  [BREATH_PHASES.DEEP_INHALE]: 'Add a small second sip of air at the top.',
  [BREATH_PHASES.HOLD_IN]: 'Hold gently. Keep the face, jaw, and hands soft.',
  [BREATH_PHASES.EXHALE]: 'Let the breath leave slowly and evenly.',
  [BREATH_PHASES.HOLD_OUT]: 'Rest at the bottom without bracing.',
  [BREATH_PHASES.REST]: 'Return to easy nasal breathing before the next round.',
} satisfies Record<BreathPhase, string>

const TECHNIQUE_PHASE_CUES: Partial<Record<TechniqueId, Partial<Record<BreathPhase, string>>>> = {
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: {
    [BREATH_PHASES.INHALE]: 'Fill the lungs through the nose with a relaxed first inhale.',
    [BREATH_PHASES.DEEP_INHALE]: 'Take the second sip gently, just enough to top off the breath.',
    [BREATH_PHASES.EXHALE]: 'Release a long sigh and let the chest settle.',
  },
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Inhale smoothly, as if following a slow metronome.',
    [BREATH_PHASES.EXHALE]: 'Exhale at the same pace, keeping the rhythm unforced.',
  },
  [TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Let the belly soften outward before the chest works.',
    [BREATH_PHASES.EXHALE]: 'Let the belly fall back naturally as the breath leaves.',
  },
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: {
    [BREATH_PHASES.INHALE]: 'Take only as much air as you can release comfortably.',
    [BREATH_PHASES.EXHALE]: 'Lengthen the outflow without squeezing at the end.',
  },
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Trace the first side of the box with a measured inhale.',
    [BREATH_PHASES.HOLD_IN]: 'Pause at the top. Stay composed, not rigid.',
    [BREATH_PHASES.EXHALE]: 'Trace the next side with an even exhale.',
    [BREATH_PHASES.HOLD_OUT]: 'Pause at the bottom and wait for the next side.',
  },
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: {
    [BREATH_PHASES.INHALE]: 'Inhale softly through the nose and keep the breath small.',
    [BREATH_PHASES.HOLD_IN]: 'Hold with ease. Release early if the retention feels sharp.',
    [BREATH_PHASES.EXHALE]: 'Exhale slowly, giving the body time to downshift.',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    [BREATH_PHASES.INHALE]: 'Take a calm, ordinary breath before the hold.',
    [BREATH_PHASES.HOLD_IN]: 'Notice the urge to breathe without fighting it. Stop before strain.',
    [BREATH_PHASES.EXHALE]: 'Exhale smoothly and stay seated.',
    [BREATH_PHASES.REST]: 'Recover with relaxed nasal breathing.',
  },
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: {
    [BREATH_PHASES.INHALE]: 'Inhale gently through the nose without chasing a deep breath.',
    [BREATH_PHASES.EXHALE]: 'Exhale through softly pursed lips, like cooling tea.',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Breathe in fully while staying seated and relaxed.',
    [BREATH_PHASES.EXHALE]: 'Let the breath fall out passively. Do not force the emptying.',
  },
}

export function getPhaseCoachCue(
  techniqueId: TechniqueId,
  phase: BreathPhase | null | undefined,
): string {
  if (!phase) {
    return READY_CUE
  }

  return TECHNIQUE_PHASE_CUES[techniqueId]?.[phase] ?? DEFAULT_PHASE_CUES[phase]
}
