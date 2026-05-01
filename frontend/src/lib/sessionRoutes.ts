import { BREATH_PHASES, type BreathPhase, type TechniqueId } from './constants'
import { clampCadenceDuration } from './cadenceDurations'

interface SessionRouteConfig {
  techniqueId: TechniqueId
  rounds: number
  customPhaseDurations?: Partial<Record<BreathPhase, number>>
}

const phaseQueryPrefix = 'phase_'
const supportedPhases = Object.values(BREATH_PHASES)

function getPhaseQueryKey(phase: BreathPhase): string {
  return `${phaseQueryPrefix}${phase}`
}

export function parseCustomPhaseDurations(
  searchParams: URLSearchParams,
): Partial<Record<BreathPhase, number>> {
  const customDurations: Partial<Record<BreathPhase, number>> = {}

  for (const phase of supportedPhases) {
    const rawDuration = searchParams.get(getPhaseQueryKey(phase))
    if (rawDuration === null) continue

    const duration = Number(rawDuration)
    if (!Number.isFinite(duration) || duration <= 0) continue

    customDurations[phase] = clampCadenceDuration(phase, duration)
  }

  return customDurations
}

export function buildSessionRoutePath({
  techniqueId,
  rounds,
  customPhaseDurations,
}: SessionRouteConfig): string {
  const searchParams = new URLSearchParams({
    technique: techniqueId,
    rounds: String(rounds),
  })

  if (customPhaseDurations) {
    for (const phase of supportedPhases) {
      const duration = customPhaseDurations[phase]
      if (duration === undefined) continue
      searchParams.set(getPhaseQueryKey(phase), String(clampCadenceDuration(phase, duration)))
    }
  }

  return `/breathwork/session?${searchParams.toString()}`
}
