import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'

/**
 * Soft Web Audio cues — one per session start, phase change, and completion.
 * No kitchen-timer beeps, no per-second ticks. Every call is wrapped so a
 * missing or broken AudioContext degrades to silence.
 */

export type CueKind = 'start' | 'complete' | BreathPhase

export interface AudioSettings {
  enabled: boolean
  /** 0–1, default 0.3. */
  volume: number
}

type AudioContextCtor = typeof AudioContext

let sharedContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (sharedContext) return sharedContext
    const globalScope = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor }
    const Ctor: AudioContextCtor | undefined = globalScope.AudioContext ?? globalScope.webkitAudioContext
    if (!Ctor) return null
    sharedContext = new Ctor()
    return sharedContext
  } catch {
    return null
  }
}

/** Test seam. */
export function resetAudioContextForTests(): void {
  sharedContext = null
}

interface Tone {
  /** [startHz, endHz] — equal values hold steady, differing values glide. */
  freq: [number, number]
  duration: number
  delay?: number
  type?: OscillatorType
  /** Peak gain multiplier relative to master volume. */
  peak?: number
}

function cueTones(kind: CueKind): Tone[] {
  switch (kind) {
    case 'start':
      return [{ freq: [392, 392], duration: 0.5, type: 'sine', peak: 0.5 }]
    case 'complete':
      // Two-note chime.
      return [
        { freq: [523.25, 523.25], duration: 0.45, type: 'sine', peak: 0.55 },
        { freq: [659.25, 659.25], duration: 0.6, delay: 0.28, type: 'sine', peak: 0.55 },
      ]
    case BREATH_PHASES.INHALE:
      // Glide up.
      return [{ freq: [330, 440], duration: 0.55, type: 'sine', peak: 0.5 }]
    case BREATH_PHASES.DEEP_INHALE:
      // Short upward sip.
      return [{ freq: [440, 523.25], duration: 0.22, type: 'sine', peak: 0.45 }]
    case BREATH_PHASES.EXHALE:
      // Glide down.
      return [{ freq: [440, 294], duration: 0.65, type: 'sine', peak: 0.5 }]
    case BREATH_PHASES.HOLD_IN:
    case BREATH_PHASES.HOLD_OUT:
    case BREATH_PHASES.REST:
      // Quiet steady tone.
      return [{ freq: [349.23, 349.23], duration: 0.4, type: 'sine', peak: 0.3 }]
    default:
      return []
  }
}

export function playCue(kind: CueKind, settings: AudioSettings): void {
  if (!settings.enabled || settings.volume <= 0) return

  try {
    const context = getAudioContext()
    if (!context) return
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }

    const volume = Math.max(0, Math.min(1, settings.volume))
    const now = context.currentTime

    for (const tone of cueTones(kind)) {
      const startAt = now + (tone.delay ?? 0)
      const endAt = startAt + tone.duration

      const oscillator = context.createOscillator()
      oscillator.type = tone.type ?? 'sine'
      oscillator.frequency.setValueAtTime(tone.freq[0], startAt)
      if (tone.freq[1] !== tone.freq[0]) {
        oscillator.frequency.linearRampToValueAtTime(tone.freq[1], endAt)
      }

      const gain = context.createGain()
      const peak = volume * (tone.peak ?? 0.5)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), startAt + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(endAt + 0.05)
    }
  } catch {
    // Silent fallback — audio is an enhancement, never a requirement.
  }
}
