import { useEffect, useLayoutEffect, useState } from 'react'
import { useHistoryStore } from '@/stores/historyStore'
import { getRecoveryStatus, type RecoveryStatus } from './recovery'

/**
 * Live recovery-window status derived from session history. Ticks at 1 Hz
 * only while the window is active so countdowns stay accurate.
 *
 * `now` is refreshed whenever history changes so a just-completed advanced
 * session is not compared against a stale mount-time clock (recovery.ts
 * ignores completions that appear to be in the future).
 */
export function useRecoveryStatus(): RecoveryStatus {
  const sessions = useHistoryStore((state) => state.sessions)
  const [now, setNow] = useState(() => new Date())
  const status = getRecoveryStatus(sessions, now)

  useLayoutEffect(() => {
    setNow(new Date())
  }, [sessions])

  useEffect(() => {
    if (!status.isActive) return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [status.isActive])

  return status
}
