import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BreathingAudioEngine, cueForPhase } from '../breathingAudio'

interface FakeOscillator {
  type: string
  connect: ReturnType<typeof vi.fn>
  frequency: { setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }
  detune: { setValueAtTime: ReturnType<typeof vi.fn> }
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface FakeGain {
  connect: ReturnType<typeof vi.fn>
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
}

const created = {
  oscillators: [] as FakeOscillator[],
  gains: [] as FakeGain[],
  contexts: [] as FakeAudioContext[],
}

class FakeAudioContext {
  currentTime = 10
  state: 'running' | 'suspended' | 'closed' = 'running'
  destination = {}
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())

  constructor() {
    created.contexts.push(this)
  }

  createOscillator(): FakeOscillator {
    const osc: FakeOscillator = {
      type: 'sine',
      connect: vi.fn(),
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      detune: { setValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
    }
    created.oscillators.push(osc)
    return osc
  }

  createGain(): FakeGain {
    const gain: FakeGain = {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    }
    created.gains.push(gain)
    return gain
  }
}

beforeEach(() => {
  created.oscillators = []
  created.gains = []
  created.contexts = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cueForPhase', () => {
  it('maps each breathing phase to the right cue', () => {
    expect(cueForPhase('inhale')).toBe('inhale')
    expect(cueForPhase('deep_inhale')).toBe('deepInhale')
    expect(cueForPhase('exhale')).toBe('exhale')
    expect(cueForPhase('hold_in')).toBe('hold')
    expect(cueForPhase('hold_out')).toBe('hold')
    expect(cueForPhase('rest')).toBe('rest')
  })
})

describe('BreathingAudioEngine', () => {
  it('does not create an AudioContext until the first audible cue', () => {
    const engine = new BreathingAudioEngine({ volume: 0.4, enabled: true })
    expect(created.contexts).toHaveLength(0)
    engine.play('inhale')
    expect(created.contexts).toHaveLength(1)
  })

  it('stays silent when disabled or muted', () => {
    const disabled = new BreathingAudioEngine({ volume: 0.4, enabled: false })
    disabled.play('inhale')
    expect(created.contexts).toHaveLength(0)
    expect(disabled.isAudible).toBe(false)

    const muted = new BreathingAudioEngine({ volume: 0, enabled: true })
    muted.play('inhale')
    expect(created.contexts).toHaveLength(0)
    expect(muted.isAudible).toBe(false)
  })

  it('applies a smooth attack/release envelope rather than an instant beep', () => {
    const engine = new BreathingAudioEngine({ volume: 0.5, enabled: true })
    engine.play('inhale')

    // First gain node is the master volume; the second is the voice envelope.
    const voiceGain = created.gains[created.gains.length - 1]
    expect(voiceGain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 10)
    // Linear fade-in to the peak (a hard beep would skip this).
    expect(voiceGain.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1)
    // Exponential fade-out to a near-zero floor.
    expect(voiceGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.0001,
      expect.any(Number),
    )
  })

  it('glides pitch upward on inhale and downward on exhale', () => {
    const engine = new BreathingAudioEngine({ volume: 0.5, enabled: true })

    engine.play('inhale')
    const inhaleOsc = created.oscillators[created.oscillators.length - 1]
    const [inhaleStart] = inhaleOsc.frequency.setValueAtTime.mock.calls[0]
    const [inhaleEnd] = inhaleOsc.frequency.exponentialRampToValueAtTime.mock.calls[0]
    expect(inhaleEnd).toBeGreaterThan(inhaleStart)

    engine.play('exhale')
    const exhaleOsc = created.oscillators[created.oscillators.length - 1]
    const [exhaleStart] = exhaleOsc.frequency.setValueAtTime.mock.calls[0]
    const [exhaleEnd] = exhaleOsc.frequency.exponentialRampToValueAtTime.mock.calls[0]
    expect(exhaleEnd).toBeLessThan(exhaleStart)
  })

  it('plays a two-voice chord on completion', () => {
    const engine = new BreathingAudioEngine({ volume: 0.5, enabled: true })
    engine.play('complete')
    // Two oscillators (root + fifth) for the completion chime.
    expect(created.oscillators).toHaveLength(2)
  })

  it('scales the peak envelope by the master volume node', () => {
    const engine = new BreathingAudioEngine({ volume: 0.25, enabled: true })
    engine.play('inhale')
    const masterGain = created.gains[0]
    expect(masterGain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, 10)
  })

  it('updates master volume live when changed mid-session', () => {
    const engine = new BreathingAudioEngine({ volume: 0.5, enabled: true })
    engine.play('inhale')
    const masterGain = created.gains[0]
    engine.setVolume(0.8)
    expect(masterGain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.8, 10)
  })

  it('reuses a single AudioContext across cues and closes it', () => {
    const engine = new BreathingAudioEngine({ volume: 0.5, enabled: true })
    engine.play('inhale')
    engine.play('exhale')
    expect(created.contexts).toHaveLength(1)
    engine.close()
    expect(created.contexts[0].close).toHaveBeenCalled()
  })

  it('degrades silently when the Web Audio API is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    const engine = new BreathingAudioEngine({ volume: 0.5, enabled: true })
    expect(() => engine.play('inhale')).not.toThrow()
  })
})
