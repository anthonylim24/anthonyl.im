import { Minus, Plus } from 'lucide-react'
import { PHASE_LABELS } from '@/lib/constants'
import { sx } from '@/styles/merge'
import { layout } from '@/styles/common.stylex'
import {
  clampPhaseSeconds,
  getPhaseBaseSeconds,
  PHASE_SECOND_LIMITS,
  sanitizeCustomDurations,
  type CustomPhaseDurations,
} from '../protocols/cadence'
import { getHoldLadder, hasProgressiveHolds } from '../protocols/progressiveHold'
import type { BreathingProtocol } from '../protocols/types'
import { bf } from '../styles/breathflow.stylex'
import { btn } from './buttonStyles.stylex'

interface CadenceEditorProps {
  protocol: BreathingProtocol
  rounds: number
  customDurations: CustomPhaseDurations | undefined
  onChange: (custom: CustomPhaseDurations | undefined) => void
}

/**
 * Per-phase second steppers with spec clamps. For the CO2 table, editing
 * hold time changes the ladder base; the +5s-per-round increment always
 * applies, so the full ladder is previewed below.
 */
export function CadenceEditor({ protocol, rounds, customDurations, onChange }: CadenceEditorProps) {
  const isCustom = customDurations !== undefined
  const ladder = hasProgressiveHolds(protocol)
    ? getHoldLadder(protocol, rounds, customDurations)
    : []

  function setPhaseSeconds(phase: (typeof protocol.phases)[number]['phase'], seconds: number) {
    const next: CustomPhaseDurations = {}
    for (const entry of protocol.phases) {
      next[entry.phase] = getPhaseBaseSeconds(protocol, entry.phase, customDurations)
    }
    next[phase] = clampPhaseSeconds(phase, seconds)
    onChange(sanitizeCustomDurations(protocol, next))
  }

  return (
    <div>
      <div>
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseBaseSeconds(protocol, phase, customDurations)
          const { min, max } = PHASE_SECOND_LIMITS[phase]
          return (
            <div key={`${phase}-${index}`} {...sx(bf.cadenceRow)}>
              <span {...sx(bf.textSm, bf.textBw)}>{PHASE_LABELS[phase]}</span>
              <div {...sx(bf.flexItemsCenterGap1)}>
                <button
                  type="button"
                  {...sx(btn.icon)}
                  aria-label={`Decrease ${PHASE_LABELS[phase]} by one second`}
                  disabled={seconds <= min}
                  onClick={() => setPhaseSeconds(phase, seconds - 1)}
                >
                  <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <span
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  {...sx(bf.w9, bf.textCenter, bf.textSm, bf.fontMedium, bf.tabularNums, bf.textBw)}
                >
                  <span {...sx(layout.srOnly)}>{PHASE_LABELS[phase]} </span>
                  {seconds}s
                </span>
                <button
                  type="button"
                  {...sx(btn.icon)}
                  aria-label={`Increase ${PHASE_LABELS[phase]} by one second`}
                  disabled={seconds >= max}
                  onClick={() => setPhaseSeconds(phase, seconds + 1)}
                >
                  <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {ladder.length > 0 && (
        <div {...sx(bf.mt3, bf.rounded2xl, bf.bgAccentSubtle, bf.p3)}>
          <p {...sx(bf.textXs, bf.fontMedium, bf.textBw)}>
            Hold ladder: +{protocol.holdIncrementSeconds}s each round
          </p>
          <p
            aria-live="polite"
            aria-atomic="true"
            {...sx(bf.mt1, bf.breakWords, bf.textXs, bf.tabularNums, bf.textSecondary)}
          >
            <span {...sx(layout.srOnly)}>Hold ladder: </span>
            {ladder.map((seconds) => `${seconds}s`).join(', ')}
          </p>
        </div>
      )}

      {isCustom && (
        <button
          type="button"
          {...sx(btn.base, btn.ghost, btn.mt2, btn.px3)}
          onClick={() => onChange(undefined)}
        >
          Reset to default cadence
        </button>
      )}
    </div>
  )
}
