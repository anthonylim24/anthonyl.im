import type { CSSProperties } from 'react'
import { BREATH_PHASES, PHASE_LABELS, type BreathPhase } from '@/lib/constants'
import { sx, stylex } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { getPhaseSecondsForRound, getRoundSeconds, type CustomPhaseDurations } from '../protocols/cadence'
import type { BreathingProtocol } from '../protocols/types'
import { techniquePigment, type Pigment } from '../pigments'

interface PhaseStripProps {
  protocol: BreathingProtocol
  customDurations?: CustomPhaseDurations
  /** Animate a wet brush tip sweeping one breath cycle. Off under reduced motion. */
  animated?: boolean
  pigment?: Pigment
  style?: Parameters<typeof sx>[0]
}

/** How much pigment each phase lays down: inhales load the brush, holds glaze. */
const LOAD: Record<BreathPhase, { pigment: 'mass' | 'glaze'; amount: number }> = {
  [BREATH_PHASES.INHALE]: { pigment: 'mass', amount: 62 },
  [BREATH_PHASES.DEEP_INHALE]: { pigment: 'mass', amount: 82 },
  [BREATH_PHASES.HOLD_IN]: { pigment: 'glaze', amount: 44 },
  [BREATH_PHASES.EXHALE]: { pigment: 'mass', amount: 30 },
  [BREATH_PHASES.HOLD_OUT]: { pigment: 'glaze', amount: 18 },
  [BREATH_PHASES.REST]: { pigment: 'glaze', amount: 14 },
}

const styles = stylex.create({
  bar: {
    position: 'relative',
    marginTop: '0.6rem',
    display: 'flex',
    gap: '3px',
    height: '0.7rem',
  },
  seg: {
    display: 'block',
    height: '100%',
    borderRadius: '999px',
  },
  tip: {
    position: 'absolute',
    insetBlock: '-0.35rem',
    left: 0,
    width: '2.25rem',
    borderRadius: '999px',
    backgroundImage: 'radial-gradient(closest-side, color-mix(in srgb, var(--bw-canvas) 85%, transparent), transparent)',
    mixBlendMode: 'screen',
  },
})

/**
 * Score of one breath cycle, painted: each phase is a stroke of pigment sized
 * to its seconds (inhales load the brush, holds glaze), named above. A wet
 * brush tip sweeps the cycle when animation is allowed.
 */
export function PhaseStrip({ protocol, customDurations, animated = false, pigment, style }: PhaseStripProps) {
  const cycleSeconds = getRoundSeconds(protocol, 0, customDurations)
  if (cycleSeconds <= 0) return null
  const paint = pigment ?? techniquePigment(protocol.id)
  const vars = { '--bf-mass': paint.mass, '--bf-glaze': paint.glaze } as CSSProperties

  return (
    <div {...sx(style)} style={vars}>
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
      <div {...sx('bf-ragged', styles.bar)}>
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseSecondsForRound(protocol, phase, 0, customDurations)
          const load = LOAD[phase]
          return (
            <span
              key={`${phase}-seg-${index}`}
              {...sx(styles.seg)}
              style={{
                width: `${(seconds / cycleSeconds) * 100}%`,
                backgroundColor: `color-mix(in srgb, var(--bf-${load.pigment}) ${load.amount}%, transparent)`,
              }}
            />
          )
        })}
        {animated && (
          <div aria-hidden="true" {...sx(bf.pointerEventsNone, bf.absolute, bf.inset0, bf.overflowHidden)}>
            <div
              {...sx('bf-sweep', bf.absolute, bf.inset0, bf.wFull)}
              style={{ animationDuration: `${cycleSeconds}s` }}
            >
              <div {...sx(styles.tip)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
