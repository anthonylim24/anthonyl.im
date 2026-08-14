import { useEffect } from 'react'

/**
 * Keeps the screen awake while `active` (a running/paused session).
 * Re-acquires after tab visibility changes; silently no-ops where the
 * Wake Lock API is unavailable.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    async function acquire(): Promise<void> {
      try {
        if (!('wakeLock' in navigator) || !navigator.wakeLock) return
        const acquired = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void acquired.release().catch(() => undefined)
          return
        }
        sentinel = acquired
      } catch {
        // Denied or unsupported — never block the session on this.
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void sentinel?.release().catch(() => undefined)
      sentinel = null
    }
  }, [active])
}
