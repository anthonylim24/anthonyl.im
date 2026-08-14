import { afterEach, describe, expect, it, vi } from 'vitest'
import { playCue, resetAudioContextForTests } from '../audio'
import { vibrate } from '../haptics'

describe('audio cues', () => {
  afterEach(() => {
    resetAudioContextForTests()
    vi.unstubAllGlobals()
  })

  it('silently no-ops without an AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => playCue('start', { enabled: true, volume: 0.3 })).not.toThrow()
    expect(() => playCue('inhale', { enabled: true, volume: 0.3 })).not.toThrow()
  })

  it('does not touch audio when sound is off or volume is zero', () => {
    const ctor = vi.fn()
    vi.stubGlobal('AudioContext', ctor)
    playCue('start', { enabled: false, volume: 0.5 })
    playCue('complete', { enabled: true, volume: 0 })
    expect(ctor).not.toHaveBeenCalled()
  })

  it('plays through a working AudioContext', () => {
    const oscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
    const context = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(() => ({ ...oscillator, frequency: { ...oscillator.frequency } })),
      createGain: vi.fn(() => ({ ...gain, gain: { ...gain.gain } })),
      resume: vi.fn(async () => undefined),
    }
    class FakeAudioContext {
      constructor() {
        return context as unknown as FakeAudioContext
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    playCue('complete', { enabled: true, volume: 0.3 })
    // Two-note chime = two oscillators.
    expect(context.createOscillator).toHaveBeenCalledTimes(2)

    playCue('inhale', { enabled: true, volume: 0.3 })
    expect(context.createOscillator).toHaveBeenCalledTimes(3)
  })
})

describe('haptics', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('vibrates the pattern for each kind when enabled', () => {
    const vibrateMock = vi.fn()
    vi.stubGlobal('navigator', { vibrate: vibrateMock })

    vibrate('light', true)
    vibrate('success', true)
    vibrate('error', true)
    vibrate('celebration', true)
    expect(vibrateMock).toHaveBeenCalledTimes(4)
    expect(vibrateMock.mock.calls[0][0]).toEqual([10])
  })

  it('respects the haptics setting', () => {
    const vibrateMock = vi.fn()
    vi.stubGlobal('navigator', { vibrate: vibrateMock })
    vibrate('light', false)
    expect(vibrateMock).not.toHaveBeenCalled()
  })

  it('no-ops without the Vibration API', () => {
    vi.stubGlobal('navigator', {})
    expect(() => vibrate('success', true)).not.toThrow()
  })
})
