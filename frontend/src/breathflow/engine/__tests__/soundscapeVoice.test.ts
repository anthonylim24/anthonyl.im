import { afterEach, describe, expect, it, vi } from 'vitest'
import { migratePersistedSettingsState } from '@/stores/settingsStore'
import { resetAudioContextForTests } from '../audio'
import { breathMix, isSoundscapeId, startSoundscape } from '../soundscape'
import { phasePhrase, speak } from '../voice'

describe('soundscape', () => {
  afterEach(() => {
    resetAudioContextForTests()
    vi.unstubAllGlobals()
  })

  it('opens the tide and the drone as the lungs fill', () => {
    for (const id of ['tide', 'drone'] as const) {
      const empty = breathMix(id, 0)
      const full = breathMix(id, 1)
      expect(full.cutoff).toBeGreaterThan(empty.cutoff)
      expect(full.body).toBeGreaterThan(empty.body)
    }
  })

  it('lets the tide foam only while the water is moving', () => {
    expect(breathMix('tide', 0).air).toBe(0)
    expect(breathMix('tide', 1).air).toBe(0)
    expect(breathMix('tide', 0.5).air).toBeGreaterThan(0)
  })

  it('keeps rain steady and clamps wild amplitudes', () => {
    expect(breathMix('rain', 0)).toEqual(breathMix('rain', 1))
    expect(breathMix('tide', 7)).toEqual(breathMix('tide', 1))
    expect(breathMix('tide', -3)).toEqual(breathMix('tide', 0))
  })

  it('is silent, not broken, without an AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(startSoundscape('tide', 0.3)).toBeNull()
  })

  it('accepts only known ids, and settings fall back to Quiet', () => {
    expect(isSoundscapeId('rain')).toBe(true)
    expect(isSoundscapeId('whalesong')).toBe(false)
    expect(migratePersistedSettingsState({ soundscape: 'whalesong', voiceGuidance: 'yes' })).toMatchObject({
      soundscape: 'off',
      voiceGuidance: false,
    })
    expect(migratePersistedSettingsState({ soundscape: 'drone', voiceGuidance: true })).toMatchObject({
      soundscape: 'drone',
      voiceGuidance: true,
    })
  })
})

describe('voice', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shortens the phrase when the phase is too brief to finish it', () => {
    expect(phasePhrase('inhale', 4)).toBe('Breathe in')
    expect(phasePhrase('inhale', 2)).toBe('In')
    expect(phasePhrase('exhale', 2)).toBe('Out')
    expect(phasePhrase('hold_in', 7)).toBe('Hold')
  })

  it('says nothing when off, and never throws where speech is missing', () => {
    const synth = { cancel: vi.fn(), speak: vi.fn() }
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text } })

    speak('Breathe in', { enabled: false, volume: 0.5 })
    expect(synth.speak).not.toHaveBeenCalled()

    speak('Breathe in', { enabled: true, volume: 0.5 })
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(synth.speak).toHaveBeenCalledTimes(1)

    vi.stubGlobal('speechSynthesis', undefined)
    expect(() => speak('Breathe in', { enabled: true, volume: 0.5 })).not.toThrow()
  })
})
