import { useEffect, useRef } from 'react'

/**
 * Keeps the screen awake using the Wake Lock API while `enabled` is true.
 * Silently no-ops on browsers that don't support it.
 */
export function useWakeLock(enabled: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return

    let disposed = false
    let requestVersion = 0

    const releaseCurrent = () => {
      const currentLock = lockRef.current
      lockRef.current = null
      currentLock?.release().catch(() => {})
    }

    const acquire = async () => {
      const version = ++requestVersion
      try {
        const lock = await navigator.wakeLock.request('screen')

        if (disposed || version !== requestVersion) {
          lock.release().catch(() => {})
          return
        }

        releaseCurrent()
        lockRef.current = lock
        lock.addEventListener('release', () => {
          if (lockRef.current === lock) {
            lockRef.current = null
          }
        })
      } catch {
        // Wake lock request failed (e.g. low battery, tab hidden)
      }
    }

    acquire()

    // Re-acquire on visibility change (lock is released when tab is hidden)
    const handleVisibility = () => {
      if (!disposed && document.visibilityState === 'visible' && !lockRef.current) {
        acquire()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      requestVersion += 1
      document.removeEventListener('visibilitychange', handleVisibility)
      releaseCurrent()
    }
  }, [enabled])
}
