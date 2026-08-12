import { BREATH_PHASES, type BreathPhase, type TechniqueId, TECHNIQUE_IDS } from '@/lib/constants'

const READY_CUE = 'Sit still. Next breath, easy.'

const DEFAULT_PHASE_CUES = {
  [BREATH_PHASES.INHALE]: 'Inhale quietly. Keep the shoulders down.',
  [BREATH_PHASES.DEEP_INHALE]: 'Add a small second sip of air at the top.',
  [BREATH_PHASES.HOLD_IN]: 'Hold gently. Soften the face, jaw, and hands.',
  [BREATH_PHASES.EXHALE]: 'Exhale slowly and evenly.',
  [BREATH_PHASES.HOLD_OUT]: 'Rest at the bottom. Do not brace.',
  [BREATH_PHASES.REST]: 'Easy nasal breathing before the next round.',
} satisfies Record<BreathPhase, string>

const TECHNIQUE_PHASE_CUES: Partial<Record<TechniqueId, Partial<Record<BreathPhase, string>>>> = {
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: {
    [BREATH_PHASES.INHALE]: 'First inhale through the nose. Fill the lungs.',
    [BREATH_PHASES.DEEP_INHALE]: 'Second sip. Just enough to top off.',
    [BREATH_PHASES.EXHALE]: 'Long slow exhale.',
  },
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Inhale on a slow even count.',
    [BREATH_PHASES.EXHALE]: 'Exhale at the same pace. Do not force it.',
  },
  [TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Let the belly move first, then the chest.',
    [BREATH_PHASES.EXHALE]: 'Let the belly fall as the breath leaves.',
  },
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: {
    [BREATH_PHASES.INHALE]: 'Take only as much air as you can release easily.',
    [BREATH_PHASES.EXHALE]: 'Lengthen the exhale. Do not squeeze at the end.',
  },
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Inhale for the first side.',
    [BREATH_PHASES.HOLD_IN]: 'Pause at the top. Stay still, not rigid.',
    [BREATH_PHASES.EXHALE]: 'Exhale for the next side.',
    [BREATH_PHASES.HOLD_OUT]: 'Pause at the bottom.',
  },
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: {
    [BREATH_PHASES.INHALE]: 'Small inhale through the nose.',
    [BREATH_PHASES.HOLD_IN]: 'Hold easily. Release early if it feels sharp.',
    [BREATH_PHASES.EXHALE]: 'Exhale slowly through the mouth.',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    [BREATH_PHASES.INHALE]: 'Ordinary breath before the hold.',
    [BREATH_PHASES.HOLD_IN]: 'Notice the urge to breathe. Stop before strain.',
    [BREATH_PHASES.EXHALE]: 'Exhale smoothly. Stay seated.',
    [BREATH_PHASES.REST]: 'Relaxed nasal breathing.',
  },
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: {
    [BREATH_PHASES.INHALE]: 'Small inhale through the nose.',
    [BREATH_PHASES.EXHALE]: 'Exhale through pursed lips.',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    [BREATH_PHASES.INHALE]: 'Full inhale. Stay seated.',
    [BREATH_PHASES.EXHALE]: 'Let the breath fall out. Do not force it.',
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
