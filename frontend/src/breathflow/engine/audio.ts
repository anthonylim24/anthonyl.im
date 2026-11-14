import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'

/**
 * Soft Web Audio cues — one per session start, phase change, and completion.
 * No kitchen-timer beeps, no per-second ticks. Each note is a small bell: a
 * sine with a quiet octave partial that dies away first, and a long tail.
 * Every call is wrapped so a missing or broken AudioContext degrades to
 * silence.
 */

export type CueKind = 'start' | 'complete' | BreathPhase

export interface AudioSettings {
  enabled: boolean
  /** 0–1, default 0.3. */
  volume: number
}

type AudioContextCtor = typeof AudioContext

let sharedContext: AudioContext | null = null

/** The one AudioContext BreathFlow shares between cues and the soundscape. */
export function getAudioContext(): AudioContext | null {
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
  try {
    void sharedContext?.close()
  } catch {
    // Ignore — the context may already be closed or be a stub.
  }
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

const BELL_PARTIALS = [
  { ratio: 1, level: 1, length: 1 },
  { ratio: 2, level: 0.22, length: 0.45 },
] as const

function cueTones(kind: CueKind): Tone[] {
  switch (kind) {
    case 'start':
      return [{ freq: [392, 392], duration: 1.2, type: 'sine', peak: 0.5 }]
    case 'complete':
      // A rising major triad, let ring.
      return [
        { freq: [523.25, 523.25], duration: 0.9, type: 'sine', peak: 0.5 },
        { freq: [659.25, 659.25], duration: 1.0, delay: 0.24, type: 'sine', peak: 0.5 },
        { freq: [783.99, 783.99], duration: 1.6, delay: 0.48, type: 'sine', peak: 0.5 },
      ]
    case BREATH_PHASES.INHALE:
      // Glide up.
      return [{ freq: [330, 440], duration: 0.9, type: 'sine', peak: 0.5 }]
    case BREATH_PHASES.DEEP_INHALE:
      // Short upward sip.
      return [{ freq: [440, 523.25], duration: 0.22, type: 'sine', peak: 0.45 }]
    case BREATH_PHASES.EXHALE:
      // Glide down.
      return [{ freq: [440, 294], duration: 1.1, type: 'sine', peak: 0.5 }]
    case BREATH_PHASES.HOLD_IN:
    case BREATH_PHASES.HOLD_OUT:
    case BREATH_PHASES.REST:
      // Quiet steady tone.
      return [{ freq: [349.23, 349.23], duration: 0.7, type: 'sine', peak: 0.3 }]
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
      const peak = volume * (tone.peak ?? 0.5)
      // The octave partial gives the strike its brightness and is gone in under half the note.
      for (const partial of BELL_PARTIALS) {
        const endAt = startAt + tone.duration * partial.length
        const oscillator = context.createOscillator()
        oscillator.type = tone.type ?? 'sine'
        oscillator.frequency.setValueAtTime(tone.freq[0] * partial.ratio, startAt)
        if (tone.freq[1] !== tone.freq[0]) {
          oscillator.frequency.linearRampToValueAtTime(tone.freq[1] * partial.ratio, endAt)
        }

        const gain = context.createGain()
        gain.gain.setValueAtTime(0.0001, startAt)
        gain.gain.exponentialRampToValueAtTime(Math.max(peak * partial.level, 0.0001), startAt + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.onended = () => {
          oscillator.disconnect()
          gain.disconnect()
        }
        oscillator.start(startAt)
        oscillator.stop(endAt + 0.05)
      }
    }
  } catch {
    // Silent fallback — audio is an enhancement, never a requirement.
  }
}
