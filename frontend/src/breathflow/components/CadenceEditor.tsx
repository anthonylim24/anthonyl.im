import { Minus, Plus } from 'lucide-react'
import { PHASE_LABELS } from '@/lib/constants'
import {
  clampPhaseSeconds,
  getPhaseBaseSeconds,
  PHASE_SECOND_LIMITS,
  sanitizeCustomDurations,
  type CustomPhaseDurations,
} from '../protocols/cadence'
import { getHoldLadder, hasProgressiveHolds } from '../protocols/progressiveHold'
import type { BreathingProtocol } from '../protocols/types'
import { btnIcon, btnGhost } from './buttonStyles'

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
      <div className="divide-y divide-bw-border-subtle">
        {protocol.phases.map(({ phase }, index) => {
          const seconds = getPhaseBaseSeconds(protocol, phase, customDurations)
          const { min, max } = PHASE_SECOND_LIMITS[phase]
          return (
            <div key={`${phase}-${index}`} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-bw">{PHASE_LABELS[phase]}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={btnIcon}
                  aria-label={`Decrease ${PHASE_LABELS[phase]} by one second`}
                  disabled={seconds <= min}
                  onClick={() => setPhaseSeconds(phase, seconds - 1)}
                >
                  <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <span className="w-9 text-center text-sm font-medium tabular-nums text-bw">
                  {seconds}s
                </span>
                <button
                  type="button"
                  className={btnIcon}
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
        <div className="mt-3 rounded-2xl bg-bw-accent-subtle p-3">
          <p className="text-xs font-medium text-bw">
            Hold ladder: +{protocol.holdIncrementSeconds}s each round
          </p>
          <p className="mt-1 break-words text-xs tabular-nums text-bw-secondary">
            {ladder.map((seconds) => `${seconds}s`).join(', ')}
          </p>
        </div>
      )}

      {isCustom && (
        <button type="button" className={`${btnGhost} mt-2 px-3`} onClick={() => onChange(undefined)}>
          Reset to default cadence
        </button>
      )}
    </div>
  )
}
