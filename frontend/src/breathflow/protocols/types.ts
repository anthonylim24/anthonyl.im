import type { BreathPhase, TechniqueId } from '@/lib/constants'

export type ProtocolCategory = 'calm' | 'focus' | 'sleep' | 'performance' | 'recovery'
export type ProtocolIntensity = 'gentle' | 'moderate' | 'advanced'
export type EvidenceLevel = 'strong' | 'promising' | 'traditional'

export interface Citation {
  authors: string
  title: string
  source: string
  year: number
  url: string
}

export interface ProtocolPhase {
  phase: BreathPhase
  seconds: number
}

export interface BreathingProtocol {
  id: TechniqueId
  name: string
  /** One-line description shown on cards. */
  description: string
  /** Longer science text shown in setup. */
  science: string
  evidenceLabel: string
  evidenceLevel: EvidenceLevel
  citations: Citation[]
  purpose: string
  bestFor: string[]
  breathsPerMinute: number
  category: ProtocolCategory
  intensity: ProtocolIntensity
  defaultRounds: number
  phases: ProtocolPhase[]
  /** CO2 tolerance: seconds added to hold_in each round. */
  holdIncrementSeconds?: number
  caution?: string
  safetyNotice?: string
  contraindications?: string[]
  /** A protocol is advanced (safety-gated) iff it has a safety checklist. */
  safetyChecklist?: string[]
}
