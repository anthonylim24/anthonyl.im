import { useId } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { BreathPhase } from '@/lib/constants'
import type { BreathingProtocol } from '@/lib/breathingProtocols'
import { cn } from '@/lib/utils'
import {
  PHASE_DURATION_LIMITS,
  PHASE_EDITOR_LABELS,
  clampCadenceDuration,
} from './cadenceDurations'

interface CadenceEditorProps {
  protocol: BreathingProtocol
  customDurations: Partial<Record<BreathPhase, number>>
  onDurationChange: (phase: BreathPhase, duration: number) => void
  onReset: () => void
  compact?: boolean
  className?: string
}

function getDurationLabel(duration: number) {
  return `${duration} ${duration === 1 ? 'second' : 'seconds'}`
}

function getPhaseValue(
  phase: BreathPhase,
  defaultDuration: number,
  customDurations: Partial<Record<BreathPhase, number>>,
) {
  return customDurations[phase] ?? defaultDuration
}

function hasCustomizedDurations(
  protocol: BreathingProtocol,
  customDurations: Partial<Record<BreathPhase, number>>,
) {
  return protocol.phases.some((phaseConfig) => {
    const customDuration = customDurations[phaseConfig.phase]
    return customDuration !== undefined && customDuration !== phaseConfig.duration
  })
}

export function CadenceEditor({
  protocol,
  customDurations,
  onDurationChange,
  onReset,
  compact = false,
  className,
}: CadenceEditorProps) {
  const headingId = useId()
  const descriptionId = useId()
  const customized = hasCustomizedDurations(protocol, customDurations)

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className={cn('border-y border-bw-border', compact ? 'py-3' : 'py-5', className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary"
          >
            Cadence
          </h2>
          <p
            id={descriptionId}
            className={cn(
              'mt-2 max-w-xl text-xs leading-relaxed text-bw-tertiary',
              compact && 'sr-only',
            )}
          >
            Adjust phase timing one second at a time. Defaults keep the protocol unchanged.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!customized}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-bw-border px-3 text-xs font-medium text-bw-tertiary transition-colors hover:bg-bw-hover hover:text-bw disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-bw-tertiary"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>

      <div
        role="group"
        aria-label={`${protocol.name} cadence controls`}
        className={cn('divide-y divide-bw-border border-t border-bw-border', compact ? 'mt-3' : 'mt-4')}
      >
        {protocol.phases.map((phaseConfig, index) => {
          const phase = phaseConfig.phase
          const label = PHASE_EDITOR_LABELS[phase]
          const value = getPhaseValue(phase, phaseConfig.duration, customDurations)
          const durationLimit = PHASE_DURATION_LIMITS[phase]
          const changed = value !== phaseConfig.duration
          const helpId = `${headingId}-${phase}-${index}-help`
          const currentLabel = getDurationLabel(value)

          return (
            <div
              key={`${phase}-${index}`}
              className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-bw">{label}</span>
                  {changed ? (
                    <span className="text-[9px] font-medium uppercase tracking-[0.07em] text-bw-accent">
                      Custom
                    </span>
                  ) : null}
                </div>
                <p id={helpId} className="mt-1 text-[10px] leading-relaxed text-bw-tertiary">
                  {phaseConfig.duration}s default, {durationLimit.min}s-{durationLimit.max}s range
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <button
                  type="button"
                  aria-label={`Decrease ${label} duration, currently ${currentLabel}`}
                  aria-describedby={helpId}
                  onClick={() => onDurationChange(phase, clampCadenceDuration(phase, value - 1))}
                  disabled={value <= durationLimit.min}
                  className="flex h-11 w-11 items-center justify-center border border-bw-border text-bw transition-colors hover:bg-bw-hover disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span
                  className="min-w-16 text-center font-mono text-sm text-bw tabular-nums"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {value}s
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${label} duration, currently ${currentLabel}`}
                  aria-describedby={helpId}
                  onClick={() => onDurationChange(phase, clampCadenceDuration(phase, value + 1))}
                  disabled={value >= durationLimit.max}
                  className="flex h-11 w-11 items-center justify-center border border-bw-border text-bw transition-colors hover:bg-bw-hover disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
