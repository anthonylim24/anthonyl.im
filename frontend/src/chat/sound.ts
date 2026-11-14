/**
 * Lim's voice and foley, synthesised with WebAudio (no samples to download).
 * Off until the visitor turns it on; every call is a no-op while off.
 */
const KEY = 'lim-chat-sound'

let enabled = false
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
/** Pitch of Lim's voice: tiny Lim squeaks, big Lim rumbles. */
let voice = 1

const ensure = (): AudioContext | null => {
  if (!enabled || typeof window === 'undefined' || !('AudioContext' in window)) return null
  if (!ctx) {
    ctx = new AudioContext()
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -14
    limiter.ratio.value = 8
    master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(limiter).connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx.state === 'running' ? ctx : null
}

type Tone = {
  type?: OscillatorType
  /** Frequency over time: [seconds, Hz] pairs, exponential ramps between. */
  f: [number, number][]
  gain: number
  dur: number
  attack?: number
  delay?: number
  /** Vibrato: [rate Hz, depth Hz]. */
  wobble?: [number, number]
}

const tone = ({ type = 'sine', f, gain, dur, attack = 0.005, delay = 0, wobble }: Tone) => {
  const ac = ensure()
  if (!ac || !master) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f[0][1], t0)
  for (let i = 1; i < f.length; i++) osc.frequency.exponentialRampToValueAtTime(f[i][1], t0 + f[i][0])
  if (wobble) {
    const lfo = ac.createOscillator()
    const depth = ac.createGain()
    lfo.frequency.value = wobble[0]
    depth.gain.setValueAtTime(wobble[1], t0)
    depth.gain.exponentialRampToValueAtTime(0.01, t0 + dur)
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(t0)
    lfo.stop(t0 + dur)
  }
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

const hiss = (gain: number, dur: number, freq: number, delay = 0, kind: BiquadFilterType = 'lowpass') => {
  const ac = ensure()
  if (!ac || !master || !noise) return
  const t0 = ac.currentTime + delay
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const g = ac.createGain()
  src.buffer = noise
  filter.type = kind
  filter.frequency.value = freq
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(master)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]

export const sound = {
  get on() {
    return enabled
  },
  load() {
    try {
      enabled = localStorage.getItem(KEY) === '1'
    } catch {
      enabled = false
    }
    return enabled
  },
  setEnabled(on: boolean) {
    enabled = on
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      /* private mode */
    }
    if (on) {
      ensure()
      sound.chime()
    } else void ctx?.suspend().catch(() => {})
  },
  setVoice(pitch: number) {
    voice = pitch
  },
  /** Rubbery bounce; `amt` 0..1 is how hard. */
  boing(amt = 0.5) {
    const a = Math.min(1, Math.max(0.1, amt))
    const f0 = (150 + a * 70) * voice
    tone({ type: 'triangle', f: [[0, f0], [0.07, f0 * 2.1], [0.34, f0 * 0.9]], gain: 0.16 + a * 0.2, dur: 0.36, wobble: [27, 34] })
  },
  /** Soft floor landing. */
  thud(amt = 0.5) {
    const a = Math.min(1, Math.max(0.1, amt))
    tone({ f: [[0, 120], [0.12, 52]], gain: 0.2 + a * 0.3, dur: 0.16 })
    hiss(0.08 + a * 0.1, 0.09, 700)
  },
  squeak() {
    const f0 = (820 + Math.random() * 260) * voice
    tone({ f: [[0, f0], [0.05, f0 * 1.7], [0.13, f0 * 1.25]], gain: 0.16, dur: 0.15, wobble: [38, 60] })
  },
  pop() {
    tone({ f: [[0, 520], [0.07, 90]], gain: 0.5, dur: 0.1 })
    hiss(0.3, 0.07, 2400, 0, 'highpass')
  },
  /** One syllable of Lim's babble while a reply streams. */
  blip() {
    const f0 = 392 * voice * PENTA[Math.floor(Math.random() * PENTA.length)]
    tone({ type: 'triangle', f: [[0, f0], [0.05, f0 * (Math.random() < 0.5 ? 1.12 : 0.9)]], gain: 0.07, dur: 0.07 })
  },
  gulp() {
    tone({ f: [[0, 330 * voice], [0.09, 130 * voice], [0.2, 300 * voice]], gain: 0.3, dur: 0.22 })
  },
  burp() {
    tone({ type: 'sawtooth', f: [[0, 96 * voice], [0.22, 62 * voice]], gain: 0.12, dur: 0.26, wobble: [31, 16] })
  },
  bonk(amt = 0.6) {
    tone({ type: 'triangle', f: [[0, 260], [0.09, 120]], gain: 0.2 + amt * 0.2, dur: 0.12 })
    hiss(0.12, 0.04, 1800)
  },
  chime() {
    ;[659, 831, 988, 1319].forEach((f, i) => tone({ f: [[0, f], [0.3, f]], gain: 0.1, dur: 0.42, delay: i * 0.07 }))
  },
  yawn() {
    tone({ f: [[0, 300 * voice], [0.25, 470 * voice], [0.9, 190 * voice]], gain: 0.12, dur: 0.95, attack: 0.2, wobble: [6, 10] })
  },
  snore() {
    hiss(0.05, 0.5, 260)
  },
  whoosh() {
    hiss(0.12, 0.3, 1200, 0, 'bandpass')
  },
  sparkle() {
    ;[1568, 2093, 2637].forEach((f, i) => tone({ f: [[0, f], [0.1, f]], gain: 0.05, dur: 0.16, delay: i * 0.045 }))
  },
  /** Dance floor: kick on every step, hat on the off-beat, a bass note per bar. */
  beat(step: number) {
    if (step % 2 === 0) tone({ f: [[0, 150], [0.11, 46]], gain: 0.55, dur: 0.16 })
    else hiss(0.07, 0.04, 6000, 0, 'highpass')
    const bass = [110, 110, 146.8, 98][Math.floor(step / 2) % 4]
    if (step % 2 === 1) tone({ type: 'square', f: [[0, bass], [0.1, bass]], gain: 0.07, dur: 0.14 })
    const lead = [659, 784, 880, 784, 988, 880, 784, 659][step % 8]
    tone({ type: 'triangle', f: [[0, lead], [0.08, lead]], gain: 0.06, dur: 0.12 })
  },
}
