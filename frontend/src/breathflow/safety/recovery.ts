import type { TechniqueId } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'
import { getProtocol, isAdvancedTechnique } from '../protocols/catalog'

/** Cool-down after any completed advanced (safety-gated) session. */
export const ADVANCED_RECOVERY_SECONDS = 90

export interface RecoveryStatus {
  isActive: boolean
  remainingSeconds: number
  /** Name of the advanced protocol that triggered the window. */
  sinceProtocolName: string | null
}

const INACTIVE: RecoveryStatus = { isActive: false, remainingSeconds: 0, sinceProtocolName: null }

/**
 * Recovery is derived from completed session history (session.date is the
 * completion time) — no extra storage, and stopped sessions never count.
 */
export function getRecoveryStatus(
  sessions: readonly CompletedSession[],
  now: Date = new Date(),
): RecoveryStatus {
  const nowTime = now.getTime()
  if (!Number.isFinite(nowTime)) return INACTIVE

  let latest: CompletedSession | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const session of sessions) {
    if (!isAdvancedTechnique(session.techniqueId)) continue
    const time = new Date(session.date).getTime()
    if (!Number.isFinite(time) || time > nowTime) continue
    if (time > latestTime) {
      latestTime = time
      latest = session
    }
  }

  if (!latest) return INACTIVE

  const elapsed = Math.floor((nowTime - latestTime) / 1000)
  if (elapsed >= ADVANCED_RECOVERY_SECONDS) return INACTIVE

  return {
    isActive: true,
    remainingSeconds: ADVANCED_RECOVERY_SECONDS - elapsed,
    sinceProtocolName: getProtocol(latest.techniqueId).name,
  }
}

/** Only advanced techniques are blocked while the window is active. */
export function isBlockedByRecovery(techniqueId: TechniqueId, status: RecoveryStatus): boolean {
  return status.isActive && isAdvancedTechnique(techniqueId)
}
