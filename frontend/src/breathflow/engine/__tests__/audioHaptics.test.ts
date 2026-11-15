import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeAudioContext, holdAudio, playCue, releaseAudio, unlockAudio } from '../audio'
import { vibrate } from '../haptics'

describe('audio cues', () => {
  afterEach(() => {
    closeAudioContext()
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
    // Three bell notes, each a fundamental and an octave partial.
    expect(context.createOscillator).toHaveBeenCalledTimes(6)

    playCue('inhale', { enabled: true, volume: 0.3 })
    expect(context.createOscillator).toHaveBeenCalledTimes(8)
  })
})

describe('audio context lifetime', () => {
  function fakeContext(state: AudioContextState) {
    const context = {
      currentTime: 0,
      state,
      destination: {},
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() })),
      resume: vi.fn(async () => undefined),
      suspend: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    }
    vi.stubGlobal('AudioContext', class {
      constructor() {
        return context
      }
    })
    return context
  }

  afterEach(() => {
    closeAudioContext()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('wakes a suspended context from a tap', () => {
    const context = fakeContext('suspended')
    unlockAudio()
    expect(context.resume).toHaveBeenCalledTimes(1)
  })

  it('suspends once the last cue has rung out, and not while a soundscape plays', () => {
    vi.useFakeTimers()
    const context = fakeContext('running')
    holdAudio()
    playCue('start', { enabled: true, volume: 0.3 })
    vi.advanceTimersByTime(10_000)
    expect(context.suspend).not.toHaveBeenCalled()

    releaseAudio()
    // The start bell rings for 1.2 s of context time.
    vi.advanceTimersByTime(500)
    expect(context.suspend).not.toHaveBeenCalled()
    context.currentTime = 2
    vi.advanceTimersByTime(5_000)
    expect(context.suspend).toHaveBeenCalledTimes(1)
  })

  it('closes the context when BreathFlow is left', () => {
    const context = fakeContext('running')
    unlockAudio()
    closeAudioContext()
    expect(context.close).toHaveBeenCalledTimes(1)
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
