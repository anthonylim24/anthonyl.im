import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import type { BreathingProtocol } from '@/lib/breathingProtocols'

const ADVANCED_SAFETY_CUES: Partial<Record<TechniqueId, string>> = {
  [TECHNIQUE_IDS.CO2_TOLERANCE]: 'Stay seated or lying down. Stop before strain, dizziness, or panic.',
  [TECHNIQUE_IDS.POWER_BREATHING]: 'Stay seated or lying down. Stop if lightheaded, numb, or uncomfortable.',
}

export function getActiveSessionSafetyCue(protocol: BreathingProtocol): string | null {
  if (!protocol.safetyChecklist?.length) {
    return null
  }

  return ADVANCED_SAFETY_CUES[protocol.id] ?? 'Stay in a safe position and stop immediately if uncomfortable.'
}
