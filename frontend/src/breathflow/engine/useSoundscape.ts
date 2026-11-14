import { useEffect } from 'react'
import { useLatestCallback } from '@/hooks/useLatestCallback'
import { useSettingsStore } from '@/stores/settingsStore'
import type { BreathSample } from '../scene/breathDrive'
import { startSoundscape } from './soundscape'

/** The breath only needs to reach the ear a few times a second; the audio graph glides between. */
const BREATH_POLL_MS = 100

/**
 * Plays the chosen soundscape while `active`, steering it from the same
 * breath reader that drives the cat. Nothing runs, and no audio graph
 * exists, while inactive, muted or set to Quiet.
 */
export function useSoundscape(active: boolean, read: () => BreathSample): void {
  const id = useSettingsStore((s) => s.soundscape)
  const enabled = useSettingsStore((s) => s.soundEnabled)
  const volume = useSettingsStore((s) => s.soundVolume)
  const readLatest = useLatestCallback(read)

  useEffect(() => {
    if (!active || !enabled || id === 'off' || volume <= 0) return
    const soundscape = startSoundscape(id, volume)
    if (!soundscape) return
    const interval = setInterval(() => soundscape.setBreath(readLatest().amplitude), BREATH_POLL_MS)
    return () => {
      clearInterval(interval)
      soundscape.stop()
    }
  }, [active, enabled, id, volume, readLatest])
}
