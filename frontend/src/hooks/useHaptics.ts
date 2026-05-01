import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebHaptics } from 'web-haptics'
import { useSettingsStore } from '@/stores/settingsStore'

type HapticInput = Parameters<WebHaptics['trigger']>[0]
type HapticOptions = Parameters<WebHaptics['trigger']>[1]
type WebHapticsModule = typeof import('web-haptics')

let hapticsModulePromise: Promise<WebHapticsModule> | null = null

function loadHapticsModule() {
  hapticsModulePromise ??= import('web-haptics')
  return hapticsModulePromise
}

export function useHaptics() {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled)
  const instanceRef = useRef<WebHaptics | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    let disposed = false

    if (!hapticsEnabled) {
      instanceRef.current?.destroy()
      instanceRef.current = null
      return
    }

    loadHapticsModule()
      .then(({ WebHaptics }) => {
        if (disposed) return

        setIsSupported(WebHaptics.isSupported)
        instanceRef.current = new WebHaptics()
      })
      .catch(() => {
        if (!disposed) setIsSupported(false)
      })

    return () => {
      disposed = true
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, [hapticsEnabled])

  const trigger = useCallback(
    (input?: HapticInput, options?: HapticOptions) => {
      if (!hapticsEnabled || !instanceRef.current) return
      instanceRef.current.trigger(input, options)
    },
    [hapticsEnabled],
  )

  const cancel = useCallback(() => {
    instanceRef.current?.cancel()
  }, [])

  return { trigger, cancel, isSupported: hapticsEnabled && isSupported }
}
