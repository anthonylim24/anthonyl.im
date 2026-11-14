import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'

/**
 * Spoken cues through the browser's own speech synthesis: no audio files and
 * no network. One short phrase per phase change, in the device's voice.
 */

const WORDS: Record<BreathPhase, { full: string; short: string }> = {
  [BREATH_PHASES.INHALE]: { full: 'Breathe in', short: 'In' },
  [BREATH_PHASES.DEEP_INHALE]: { full: 'Sip in', short: 'Sip' },
  [BREATH_PHASES.HOLD_IN]: { full: 'Hold', short: 'Hold' },
  [BREATH_PHASES.EXHALE]: { full: 'Breathe out', short: 'Out' },
  [BREATH_PHASES.HOLD_OUT]: { full: 'Hold', short: 'Hold' },
  [BREATH_PHASES.REST]: { full: 'Rest', short: 'Rest' },
}

/** A phase shorter than this gets the one-syllable word, so speech never runs into the next phase. */
const SHORT_PHASE_SECONDS = 3

export function phasePhrase(phase: BreathPhase, phaseSeconds: number): string {
  const words = WORDS[phase]
  return phaseSeconds < SHORT_PHASE_SECONDS ? words.short : words.full
}

export interface VoiceSettings {
  enabled: boolean
  /** 0–1. */
  volume: number
}

/** Say a phrase, replacing whatever was still being said. Silent where speech is missing. */
export function speak(text: string, settings: VoiceSettings): void {
  if (!settings.enabled || settings.volume <= 0) return
  try {
    const synth = globalThis.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85
    utterance.pitch = 0.9
    // Speech is far louder than the tones at the same setting.
    utterance.volume = Math.min(1, settings.volume * 1.6)
    synth.speak(utterance)
  } catch {
    // Voice is an enhancement, never a requirement.
  }
}

export function stopSpeaking(): void {
  try {
    globalThis.speechSynthesis?.cancel()
  } catch {
    // Nothing to stop.
  }
}

export function voiceAvailable(): boolean {
  return typeof globalThis.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}
