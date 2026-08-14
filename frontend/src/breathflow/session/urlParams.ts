import { BREATH_PHASES, type BreathPhase, type TechniqueId } from '@/lib/constants'
import { getProtocol } from '../protocols/catalog'
import {
  clampRounds,
  sanitizeCustomDurations,
  type CustomPhaseDurations,
} from '../protocols/cadence'

/**
 * Session deep-link contract:
 *   /breathwork/session?technique=<id>&rounds=<n>&phase_<phase>=<seconds>
 * Unknown technique → Cyclic Sighing. Invalid rounds → protocol default.
 * Phase params are clamped and dropped when equal to the protocol default.
 */

export interface SessionParams {
  techniqueId: TechniqueId
  rounds: number
  customDurations?: CustomPhaseDurations
}

const ALL_PHASES: readonly BreathPhase[] = Object.values(BREATH_PHASES)

export function parseSessionSearch(search: string | URLSearchParams): SessionParams {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const protocol = getProtocol(params.get('technique'))

  const roundsRaw = Number.parseInt(params.get('rounds') ?? '', 10)
  const rounds = Number.isFinite(roundsRaw) && roundsRaw > 0
    ? clampRounds(protocol, roundsRaw)
    : protocol.defaultRounds

  const custom: CustomPhaseDurations = {}
  for (const phase of ALL_PHASES) {
    const raw = params.get(`phase_${phase}`)
    if (raw === null) continue
    const seconds = Number.parseInt(raw, 10)
    if (Number.isFinite(seconds)) {
      custom[phase] = seconds
    }
  }

  return {
    techniqueId: protocol.id,
    rounds,
    customDurations: sanitizeCustomDurations(protocol, custom),
  }
}

export function buildSessionSearch(params: SessionParams): string {
  const protocol = getProtocol(params.techniqueId)
  const search = new URLSearchParams()
  search.set('technique', protocol.id)
  search.set('rounds', String(clampRounds(protocol, params.rounds)))

  const custom = sanitizeCustomDurations(protocol, params.customDurations)
  if (custom) {
    for (const { phase } of protocol.phases) {
      const seconds = custom[phase]
      if (seconds !== undefined) {
        search.set(`phase_${phase}`, String(seconds))
      }
    }
  }

  return search.toString()
}

export function buildSessionPath(params: SessionParams): string {
  return `/breathwork/session?${buildSessionSearch(params)}`
}

/** Rebuild the deep link that reproduces a saved session (Repeat). */
export function buildRepeatParams(session: {
  techniqueId: TechniqueId
  rounds: number
  customPhaseDurations?: CustomPhaseDurations
}): SessionParams {
  return {
    techniqueId: session.techniqueId,
    rounds: session.rounds,
    customDurations: session.customPhaseDurations,
  }
}
