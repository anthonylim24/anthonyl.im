import { PHASE_LABELS } from '@/lib/constants'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { getPhaseSecondsForRound, getRoundSeconds, type CustomPhaseDurations } from '../protocols/cadence'
import type { BreathingProtocol } from '../protocols/types'

interface PhaseStripProps {
  protocol: BreathingProtocol
  customDurations?: CustomPhaseDurations
  /** Animate a cursor sweeping one breath cycle. Off under reduced motion. */
  animated?: boolean
  style?: Parameters<typeof sx>[0]
}

/**
 * Typographic score of one breath cycle: each phase is named with its
 * seconds, sitting on a proportional hairline. A cursor sweeps the rule
 * when animation is allowed.
 */
export function PhaseStrip({ protocol, customDurations, animated = false, style }: PhaseStripProps) {
  const cycleSeconds = getRoundSeconds(protocol, 0, customDurations)
  if (cycleSeconds <= 0) return null

  return (
    <div {...sx(style)}>
      <p {...sx('bf-display', bf.text12px, bf.leadingRelaxed, bf.textSecondary)}>
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseSecondsForRound(protocol, phase, 0, customDurations)
          const label = PHASE_LABELS[phase].toLowerCase()
          return (
            <span key={`${phase}-${index}`}>
              {index > 0 && <span {...sx(bf.textTertiary)}> · </span>}
              {seconds}s {label}
            </span>
          )
        })}
      </p>
      <div {...sx(bf.phaseBar)}>
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseSecondsForRound(protocol, phase, 0, customDurations)
          return (
            <span
              key={`${phase}-seg-${index}`}
              {...sx(bf.phaseSeg)}
              style={{ width: `${(seconds / cycleSeconds) * 100}%` }}
            />
          )
        })}
        {animated && (
          <div aria-hidden="true" {...sx(bf.pointerEventsNone, bf.absolute, bf.inset0, bf.overflowHidden)}>
            <div
              {...sx('bf-sweep', bf.absolute, bf.insetY1, bf.left0, bf.wFull)}
              style={{ animationDuration: `${cycleSeconds}s` }}
            >
              <div {...sx(bf.sweepGradient)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
