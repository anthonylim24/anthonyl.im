import { getProtocol } from './breathingProtocols'
import type { TechniqueId } from './constants'
import type { CompletedSession } from '@/stores/historyStore'

export const ADVANCED_PROTOCOL_RECOVERY_SECONDS = 90

export interface AdvancedProtocolRecoveryStatus {
  isActive: boolean
  remainingSeconds: number
  lastProtocolName: string | null
}

const INACTIVE_RECOVERY_STATUS: AdvancedProtocolRecoveryStatus = {
  isActive: false,
  remainingSeconds: 0,
  lastProtocolName: null,
}

export function isAdvancedBreathingProtocol(techniqueId: TechniqueId): boolean {
  return Boolean(getProtocol(techniqueId).safetyChecklist?.length)
}

export function getAdvancedProtocolRecoveryStatus(
  sessions: CompletedSession[],
  selectedTechniqueId: TechniqueId,
  now = new Date(),
): AdvancedProtocolRecoveryStatus {
  if (!isAdvancedBreathingProtocol(selectedTechniqueId)) {
    return INACTIVE_RECOVERY_STATUS
  }

  const nowTime = now.getTime()
  if (!Number.isFinite(nowTime)) {
    return INACTIVE_RECOVERY_STATUS
  }

  let latestAdvancedSession: CompletedSession | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const session of sessions) {
    if (!isAdvancedBreathingProtocol(session.techniqueId)) {
      continue
    }

    const sessionTime = new Date(session.date).getTime()
    if (!Number.isFinite(sessionTime) || sessionTime > nowTime) {
      continue
    }

    if (sessionTime > latestTime) {
      latestTime = sessionTime
      latestAdvancedSession = session
    }
  }

  if (!latestAdvancedSession) {
    return INACTIVE_RECOVERY_STATUS
  }

  const elapsedSeconds = Math.floor((nowTime - latestTime) / 1000)
  const remainingSeconds = Math.max(
    0,
    ADVANCED_PROTOCOL_RECOVERY_SECONDS - elapsedSeconds,
  )

  if (remainingSeconds === 0) {
    return INACTIVE_RECOVERY_STATUS
  }

  return {
    isActive: true,
    remainingSeconds,
    lastProtocolName: getProtocol(latestAdvancedSession.techniqueId).name,
  }
}
