import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { getProtocol } from '../protocols/catalog'

/** XP awarded on completion only — never for stopped sessions. */
export const BASE_XP: Record<TechniqueId, number> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: 50,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: 55,
  [TECHNIQUE_IDS.POWER_BREATHING]: 50,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: 55,
  [TECHNIQUE_IDS.RESONANCE_BREATHING]: 55,
  [TECHNIQUE_IDS.DIAPHRAGMATIC_BREATHING]: 50,
  [TECHNIQUE_IDS.EXTENDED_EXHALE]: 50,
  [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: 55,
  [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: 45,
}

export const MAX_STREAK_MULTIPLIER = 2.0

/** A session ended early still earns something, so one round is never worth zero. */
export const MIN_SESSION_XP = 5

/**
 * XP = round((base + extraRounds * 5) * min(1 + streak * 0.1, 2.0) * completion)
 * extraRounds = max(0, rounds - defaultRounds). `completion` is the share of
 * the planned rounds that were breathed (1 unless the session was ended early).
 */
export function calculateXP(techniqueId: TechniqueId, rounds: number, streak: number, completion = 1): number {
  const base = BASE_XP[techniqueId]
  const extraRounds = Math.max(0, rounds - getProtocol(techniqueId).defaultRounds)
  const multiplier = Math.min(1 + Math.max(0, streak) * 0.1, MAX_STREAK_MULTIPLIER)
  const share = Math.min(1, Math.max(0, completion))
  return Math.max(MIN_SESSION_XP, Math.round((base + extraRounds * 5) * multiplier * share))
}
