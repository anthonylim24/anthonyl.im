/**
 * BreathingAudioEngine — gentle, purpose-built audio cues for breathwork sessions.
 *
 * Design intent (see CLAUDE.md "BreathFlow" → "Serenity first" + "Calm, Scientific,
 * Premium"): the audio should feel like a precision wellness instrument, never an
 * alarm. We deliberately avoid the old per-second countdown beeps — a calm session
 * should not tick like a kitchen timer. Instead each phase transition gets a single
 * soft, enveloped tone:
 *
 *   - inhale       — a warm tone that glides *up* in pitch (the breath rising)
 *   - deep inhale  — a brighter, shorter "sip" on top of the inhale
 *   - exhale       — a lower tone that glides *down* and lingers (the breath falling)
 *   - hold / rest  — a single quiet, steady mid tone (suspension, not silence)
 *   - start        — a soft grounding tone as the session opens
 *   - complete     — a warm two-note chime (root + fifth) with a long release
 *
 * Tones use a smooth attack/release envelope and a slightly detuned oscillator pair
 * for warmth, all scaled by the user's volume preference. Everything is wrapped so a
 * missing/blocked Web Audio API degrades silently to no sound.
 */

export type BreathCue =
  | 'start'
  | 'inhale'
  | 'deepInhale'
  | 'exhale'
  | 'hold'
  | 'rest'
  | 'complete'

interface ToneVoice {
  /** Starting frequency in Hz. */
  from: number
  /** Ending frequency in Hz (pitch glides from→to across the tone). */
  to: number
  /** Peak gain as a fraction of master volume (0..1). Keeps cues gentle. */
  gain: number
}

interface ToneSpec {
  /** One entry per simultaneous oscillator (a chord is multiple voices). */
  voices: ToneVoice[]
  /** Fade-in time in seconds — longer = softer, more "breath-like" onset. */
  attack: number
  /** Fade-out time in seconds — exhale/complete linger; holds are short. */
  release: number
}

/**
 * Cue definitions. Frequencies sit in a warm, consonant range (a loose
 * C/G pentatonic) so successive cues never feel dissonant or jarring.
 */
const TONES: Record<BreathCue, ToneSpec> = {
  // Grounding tone as the session opens.
  start: {
    voices: [{ from: 392, to: 392, gain: 0.5 }],
    attack: 0.06,
    release: 0.9,
  },
  // The breath rising: a gentle upward glide.
  inhale: {
    voices: [{ from: 294, to: 392, gain: 0.5 }],
    attack: 0.08,
    release: 0.7,
  },
  // The second "sip" of a cyclic sigh — brighter, shorter, sits above the inhale.
  deepInhale: {
    voices: [{ from: 392, to: 494, gain: 0.42 }],
    attack: 0.05,
    release: 0.5,
  },
  // The breath falling: a downward glide that lingers a touch longer.
  exhale: {
    voices: [{ from: 392, to: 262, gain: 0.5 }],
    attack: 0.08,
    release: 1.0,
  },
  // Suspension — a single quiet, steady mid tone.
  hold: {
    voices: [{ from: 330, to: 330, gain: 0.32 }],
    attack: 0.06,
    release: 0.6,
  },
  // Recovery rest — soft and low.
  rest: {
    voices: [{ from: 247, to: 247, gain: 0.32 }],
    attack: 0.06,
    release: 0.7,
  },
  // Warm closing chime: root + fifth, long release.
  complete: {
    voices: [
      { from: 392, to: 392, gain: 0.5 },
      { from: 587, to: 587, gain: 0.34 },
    ],
    attack: 0.05,
    release: 1.4,
  },
}

/** Slight detune (in cents) between the paired oscillators for a warmer, less synthetic tone. */
const DETUNE_CENTS = 4

type AudioContextConstructor = new () => AudioContext

function resolveAudioContextCtor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as typeof window & { webkitAudioContext?: AudioContextConstructor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export class BreathingAudioEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private volume: number
  private enabled: boolean

  constructor(options: { volume?: number; enabled?: boolean } = {}) {
    this.volume = clampVolume(options.volume ?? 0.3)
    this.enabled = options.enabled ?? true
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume)
    if (this.masterGain && this.context) {
      this.masterGain.gain.setValueAtTime(this.volume, this.context.currentTime)
    }
  }

  /** Whether this cue would actually produce sound right now. Exposed for tests/guards. */
  get isAudible(): boolean {
    return this.enabled && this.volume > 0
  }

  /**
   * Play a single breathing cue. No-op (and silent) when disabled, muted, or when
   * the Web Audio API is unavailable. Safe to call on every phase transition.
   */
  play(cue: BreathCue): void {
    if (!this.isAudible) return

    const context = this.ensureContext()
    if (!context || !this.masterGain) return

    const spec = TONES[cue]
    const now = context.currentTime
    const duration = spec.attack + spec.release

    try {
      for (const voice of spec.voices) {
        this.scheduleVoice(context, this.masterGain, voice, spec, now, duration)
      }
    } catch {
      // A scheduling failure should never interrupt a session.
    }
  }

  private scheduleVoice(
    context: AudioContext,
    destination: GainNode,
    voice: ToneVoice,
    spec: ToneSpec,
    now: number,
    duration: number,
  ): void {
    const osc = context.createOscillator()
    const gain = context.createGain()

    osc.type = 'sine'
    osc.connect(gain)
    gain.connect(destination)

    // Pitch glide from→to over the tone (a no-op when from === to).
    osc.frequency.setValueAtTime(voice.from, now)
    if (voice.to !== voice.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, voice.to), now + duration)
    }

    // A pair of detuned voices reads as warmer than a single pure sine.
    if (typeof osc.detune?.setValueAtTime === 'function') {
      osc.detune.setValueAtTime(DETUNE_CENTS, now)
    }

    // Envelope: silent → peak (attack) → silent (release). exponential ramps
    // can't target 0, so we ride down to a near-zero floor.
    const peak = Math.max(0.0001, voice.gain)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(peak, now + spec.attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    osc.start(now)
    osc.stop(now + duration + 0.05)
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      // Browsers suspend the context until a user gesture; a session always
      // starts from a tap/click, so resuming here is safe.
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => {})
      }
      return this.context
    }

    const Ctor = resolveAudioContextCtor()
    if (!Ctor) return null

    try {
      const context = new Ctor()
      const masterGain = context.createGain()
      masterGain.gain.setValueAtTime(this.volume, context.currentTime)
      masterGain.connect(context.destination)
      this.context = context
      this.masterGain = masterGain
      return context
    } catch {
      this.context = null
      this.masterGain = null
      return null
    }
  }

  /** Release the audio context. Call on unmount. */
  close(): void {
    if (this.context) {
      void this.context.close?.()
      this.context = null
      this.masterGain = null
    }
  }
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0
  return Math.max(0, Math.min(1, volume))
}

/** Map a breathing phase to its audio cue. */
export function cueForPhase(phase: string): BreathCue {
  switch (phase) {
    case 'inhale':
      return 'inhale'
    case 'deep_inhale':
      return 'deepInhale'
    case 'exhale':
      return 'exhale'
    case 'hold_in':
    case 'hold_out':
      return 'hold'
    case 'rest':
      return 'rest'
    default:
      return 'inhale'
  }
}
