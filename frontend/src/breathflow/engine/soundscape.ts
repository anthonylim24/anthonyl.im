import { getAudioContext } from './audio'

/**
 * Generative ambience for a session, synthesised with Web Audio (no audio
 * files to download). Tide and drone follow the breath: they open as the
 * lungs fill and settle as they empty, so the pacing can be heard with eyes
 * closed. Rain is steady.
 *
 * A soundscape is an engine with a lifetime: `startSoundscape` builds the
 * graph and fades it in, `setBreath` steers it, `stop` fades it out and
 * releases every node.
 */

export const SOUNDSCAPE_IDS = ['off', 'tide', 'rain', 'drone'] as const
export type SoundscapeId = typeof SOUNDSCAPE_IDS[number]
export type ActiveSoundscapeId = Exclude<SoundscapeId, 'off'>

export const SOUNDSCAPES: readonly { id: SoundscapeId; name: string; blurb: string }[] = [
  { id: 'off', name: 'Quiet', blurb: 'Cues only' },
  { id: 'tide', name: 'Tide', blurb: 'A wave that draws in and washes out with your breath' },
  { id: 'rain', name: 'Rain', blurb: 'Steady rain on a window' },
  { id: 'drone', name: 'Drone', blurb: 'A low open fifth that brightens as you fill' },
]

export function isSoundscapeId(value: unknown): value is SoundscapeId {
  return typeof value === 'string' && (SOUNDSCAPE_IDS as readonly string[]).includes(value)
}

export interface Soundscape {
  /** 0 = fully exhaled, 1 = fully inhaled. Call a few times a second. */
  setBreath: (amplitude: number) => void
  /** Fade out and release the graph. Safe to call twice. */
  stop: () => void
}

export interface BreathMix {
  /** Low-pass cutoff of the main layer, Hz. */
  cutoff: number
  /** Gain of the main layer, 0..1. */
  body: number
  /** Gain of the bright layer (foam on the tide), 0..1. */
  air: number
}

/** How a soundscape should sound at a breath amplitude. Pure, so it is tested without audio. */
export function breathMix(id: ActiveSoundscapeId, amplitude: number): BreathMix {
  const a = Math.min(1, Math.max(0, amplitude))
  switch (id) {
    case 'tide':
      // Foam peaks mid-breath, while the water is moving, and is silent at both ends.
      return { cutoff: 260 + a * 1500, body: 0.22 + a * 0.6, air: 4 * a * (1 - a) * 0.22 }
    case 'drone':
      return { cutoff: 240 + a * 900, body: 0.3 + a * 0.45, air: a * 0.12 }
    case 'rain':
      return { cutoff: 7000, body: 0.5, air: 0.35 }
  }
}

const FADE_SECONDS = 0.9
/** Ambience sits under the cues: this share of the master volume. */
const AMBIENCE_LEVEL = 0.55

let noise: AudioBuffer | null = null

/** Four seconds of white noise, baked once and looped by every noise layer. */
function noiseBuffer(context: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === context.sampleRate) return noise
  const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noise = buffer
  return buffer
}

export function startSoundscape(id: ActiveSoundscapeId, volume: number): Soundscape | null {
  try {
    const context = getAudioContext()
    if (!context) return null
    if (context.state === 'suspended') void context.resume().catch(() => undefined)

    const now = context.currentTime
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, Math.min(1, Math.max(0, volume)) * AMBIENCE_LEVEL),
      now + FADE_SECONDS,
    )
    master.connect(context.destination)

    const sources: AudioScheduledSourceNode[] = []
    const nodes: AudioNode[] = [master]
    const layer = (input: AudioNode, filterType: BiquadFilterType, frequency: number) => {
      const filter = context.createBiquadFilter()
      filter.type = filterType
      filter.frequency.value = frequency
      const gain = context.createGain()
      gain.gain.value = 0
      input.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      nodes.push(filter, gain)
      return { filter, gain }
    }
    const noiseSource = () => {
      const source = context.createBufferSource()
      source.buffer = noiseBuffer(context)
      source.loop = true
      sources.push(source)
      return source
    }

    let body: { filter: BiquadFilterNode; gain: GainNode }
    let air: { filter: BiquadFilterNode; gain: GainNode }
    if (id === 'drone') {
      // An open fifth on G, each note doubled a few cents apart so it beats slowly.
      const mix = context.createGain()
      mix.gain.value = 0.2
      nodes.push(mix)
      for (const hz of [98, 98.4, 146.83, 147.3, 196]) {
        const oscillator = context.createOscillator()
        oscillator.type = 'triangle'
        oscillator.frequency.value = hz
        oscillator.connect(mix)
        sources.push(oscillator)
      }
      const shimmer = context.createOscillator()
      shimmer.type = 'sine'
      shimmer.frequency.value = 392
      sources.push(shimmer)
      body = layer(mix, 'lowpass', 240)
      air = layer(shimmer, 'lowpass', 1200)
    } else if (id === 'tide') {
      body = layer(noiseSource(), 'lowpass', 260)
      air = layer(noiseSource(), 'bandpass', 2600)
    } else {
      body = layer(noiseSource(), 'bandpass', 2400)
      body.filter.Q.value = 0.4
      air = layer(noiseSource(), 'lowpass', 190)
    }
    for (const source of sources) source.start(now)

    const apply = (amplitude: number, glide: number) => {
      const mix = breathMix(id, amplitude)
      const at = context.currentTime
      if (id !== 'rain') body.filter.frequency.setTargetAtTime(mix.cutoff, at, glide)
      body.gain.gain.setTargetAtTime(mix.body, at, glide)
      air.gain.gain.setTargetAtTime(mix.air, at, glide)
    }
    apply(0, 0.01)

    let stopped = false
    return {
      setBreath: (amplitude) => {
        if (!stopped) apply(amplitude, 0.18)
      },
      stop: () => {
        if (stopped) return
        stopped = true
        const at = context.currentTime
        master.gain.cancelScheduledValues(at)
        master.gain.setTargetAtTime(0.0001, at, FADE_SECONDS / 4)
        for (const source of sources) source.stop(at + FADE_SECONDS)
        setTimeout(() => {
          for (const node of nodes) node.disconnect()
        }, FADE_SECONDS * 1000 + 100)
      },
    }
  } catch {
    // Ambience is an enhancement: a broken audio stack degrades to silence.
    return null
  }
}
