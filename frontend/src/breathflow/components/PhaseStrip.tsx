import { PHASE_LABELS } from '@/lib/constants'
import { getPhaseSecondsForRound, getRoundSeconds, type CustomPhaseDurations } from '../protocols/cadence'
import type { BreathingProtocol } from '../protocols/types'

interface PhaseStripProps {
  protocol: BreathingProtocol
  customDurations?: CustomPhaseDurations
  /** Animate a cursor sweeping one breath cycle. Off under reduced motion. */
  animated?: boolean
  className?: string
}

/**
 * Typographic score of one breath cycle: each phase is named with its
 * seconds, sitting on a proportional hairline. A cursor sweeps the rule
 * when animation is allowed.
 */
export function PhaseStrip({ protocol, customDurations, animated = false, className }: PhaseStripProps) {
  const cycleSeconds = getRoundSeconds(protocol, 0, customDurations)
  if (cycleSeconds <= 0) return null

  return (
    <div className={className}>
      <p className="bf-display text-[12px] leading-relaxed text-bw-secondary">
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseSecondsForRound(protocol, phase, 0, customDurations)
          const label = PHASE_LABELS[phase].toLowerCase()
          return (
            <span key={`${phase}-${index}`}>
              {index > 0 && <span className="text-bw-tertiary"> · </span>}
              {seconds}s {label}
            </span>
          )
        })}
      </p>
      <div className="relative mt-2 flex h-px w-full overflow-hidden bg-bw-border">
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseSecondsForRound(protocol, phase, 0, customDurations)
          return (
            <span
              key={`${phase}-seg-${index}`}
              className="block h-full"
              style={{ width: `${(seconds / cycleSeconds) * 100}%` }}
            />
          )
        })}
        {animated && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="bf-sweep absolute inset-y-0 w-full"
              style={{ animationDuration: `${cycleSeconds}s` }}
            >
              <div className="absolute inset-y-0 left-0 w-px bg-bw-accent" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
