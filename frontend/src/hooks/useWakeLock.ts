import { useEffect, useRef } from 'react'

/**
 * Keeps the screen awake using the Wake Lock API while `enabled` is true.
 * Silently no-ops on browsers that don't support it.
 */
export function useWakeLock(enabled: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return

    let released = false

    const acquire = async () => {
      try {
        lockRef.current = await navigator.wakeLock.request('screen')
        lockRef.current.addEventListener('release', () => {
          lockRef.current = null
        })
      } catch {
        // Wake lock request failed (e.g. low battery, tab hidden)
      }
    }

    acquire()

    // Re-acquire on visibility change (lock is released when tab is hidden)
    const handleVisibility = () => {
      if (!released && document.visibilityState === 'visible') {
        acquire()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', handleVisibility)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [enabled])
}
