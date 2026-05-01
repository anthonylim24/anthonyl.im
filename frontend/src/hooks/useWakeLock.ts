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
    let acquiring = false
    let releaseListener: (() => void) | null = null

    const releaseCurrent = () => {
      const currentLock = lockRef.current
      lockRef.current = null
      if (currentLock && releaseListener) {
        currentLock.removeEventListener('release', releaseListener)
        releaseListener = null
      }
      currentLock?.release().catch(() => {})
    }

    const acquire = async () => {
      if (lockRef.current || acquiring) return

      acquiring = true
      const version = ++requestVersion
      try {
        const lock = await navigator.wakeLock.request('screen')

        if (disposed || version !== requestVersion) {
          lock.release().catch(() => {})
          return
        }

        releaseCurrent()
        lockRef.current = lock
        releaseListener = () => {
          if (lockRef.current === lock) {
            lockRef.current = null
            releaseListener = null
            if (!disposed && document.visibilityState === 'visible') {
              void acquire()
            }
          }
        }
        lock.addEventListener('release', releaseListener)
      } catch {
        // Wake lock request failed (e.g. low battery, tab hidden)
      } finally {
        if (version === requestVersion) {
          acquiring = false
        }
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
