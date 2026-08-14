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
 * Proportional strip of one breath cycle: each phase gets a segment sized by
 * its seconds, with a slow cursor sweeping one full cycle when animation is
 * allowed. Orientation, not decoration: it shows the cadence at a glance.
 */
export function PhaseStrip({ protocol, customDurations, animated = false, className }: PhaseStripProps) {
  const cycleSeconds = getRoundSeconds(protocol, 0, customDurations)
  if (cycleSeconds <= 0) return null

  return (
    <div className={className}>
      <div className="relative flex h-8 w-full gap-px overflow-hidden rounded-lg">
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseSecondsForRound(protocol, phase, 0, customDurations)
          const isInhale = phase === 'inhale' || phase === 'deep_inhale'
          return (
            <div
              key={`${phase}-${index}`}
              className={`flex items-center justify-center overflow-hidden ${
                isInhale ? 'bg-bw-accent-subtle' : 'bg-bw-hover'
              }`}
              style={{ width: `${(seconds / cycleSeconds) * 100}%` }}
            >
              <span className="truncate px-1 text-[10px] font-medium text-bw-secondary">
                {seconds}s
              </span>
            </div>
          )
        })}
        {animated && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="bf-sweep absolute inset-y-0 w-full"
              style={{ animationDuration: `${cycleSeconds}s` }}
            >
              <div className="absolute inset-y-0 left-0 w-0.5 bg-bw-accent" />
            </div>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex w-full gap-px">
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseSecondsForRound(protocol, phase, 0, customDurations)
          return (
            <span
              key={`${phase}-label-${index}`}
              className="truncate text-[10px] text-bw-tertiary"
              style={{ width: `${(seconds / cycleSeconds) * 100}%` }}
            >
              {PHASE_LABELS[phase]}
            </span>
          )
        })}
      </div>
    </div>
  )
}
