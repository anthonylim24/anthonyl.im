import { useCallback, useEffect, useRef } from 'react'
import { WebHaptics } from 'web-haptics'
import { useSettingsStore } from '@/stores/settingsStore'

type HapticInput = Parameters<WebHaptics['trigger']>[0]
type HapticOptions = Parameters<WebHaptics['trigger']>[1]

export function useHaptics() {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled)
  const instanceRef = useRef<WebHaptics | null>(null)

  useEffect(() => {
    instanceRef.current = new WebHaptics()
    return () => {
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, [])

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

  return { trigger, cancel, isSupported: WebHaptics.isSupported }
}
