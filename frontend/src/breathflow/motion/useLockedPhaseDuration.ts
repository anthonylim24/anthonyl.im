import { useRef } from 'react'
import type { EngineStatus } from '../engine/sessionEngine'

/**
 * Locks the Motion duration at phase start (or resume) so 1s engine ticks
 * do not restart the tween. Restarting every tick is what makes the orb hitch.
 */
export function useLockedPhaseDuration(
  phaseIndex: number,
  phaseSeconds: number,
  secondsLeftInPhase: number,
  status: EngineStatus,
): number {
  const durationRef = useRef(Math.max(0.2, phaseSeconds))
  const phaseRef = useRef(phaseIndex)
  const statusRef = useRef(status)

  if (phaseRef.current !== phaseIndex) {
    phaseRef.current = phaseIndex
    durationRef.current = Math.max(0.2, phaseSeconds)
  } else if (statusRef.current !== 'running' && status === 'running') {
    durationRef.current = Math.max(0.2, secondsLeftInPhase)
  }
  statusRef.current = status

  return durationRef.current
}
