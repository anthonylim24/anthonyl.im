import { useId } from 'react'
import type { BreathingProtocol } from '@/lib/breathingProtocols'
import type { BreathPhase } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { getProgressiveHoldDurations } from './progressiveHold'

interface ProgressiveHoldLadderProps {
  protocol: BreathingProtocol
  rounds: number
  customPhaseDurations?: Partial<Record<BreathPhase, number>>
  compact?: boolean
  className?: string
}

function buildLadderLabel(durations: number[]) {
  return `Progressive hold ladder: ${durations
    .map((duration, index) => `round ${index + 1} ${duration} seconds`)
    .join(', ')}.`
}

export function ProgressiveHoldLadder({
  protocol,
  rounds,
  customPhaseDurations,
  compact = false,
  className,
}: ProgressiveHoldLadderProps) {
  const headingId = useId()
  const durations = getProgressiveHoldDurations(protocol, rounds, customPhaseDurations)

  if (durations.length === 0) {
    return null
  }

  const maxDuration = Math.max(...durations)

  return (
    <section
      aria-labelledby={headingId}
      className={cn('border-y border-bw-border py-4', compact ? 'my-3' : 'my-5', className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id={headingId}
            className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary"
          >
            Hold ladder
          </h2>
          {!compact ? (
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-bw-tertiary">
              Each round increases the breath hold. Stay seated, keep the hold calm, and stop before strain.
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right font-mono text-xs text-bw-secondary tabular-nums">
          {durations[0]}s → {durations[durations.length - 1]}s
        </div>
      </div>

      <div
        role="img"
        aria-label={buildLadderLabel(durations)}
        className="mt-4 grid gap-1.5"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(3.1rem, 1fr))',
        }}
      >
        {durations.map((duration, index) => (
          <div
            key={`${index}-${duration}`}
            className="min-h-12 border border-bw-border bg-bw-active px-2 py-2"
            data-testid="progressive-hold-step"
          >
            <div className="text-[9px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
              R{index + 1}
            </div>
            <div className="mt-1 h-1 bg-bw-border" aria-hidden="true">
              <div
                className="h-full bg-bw-accent"
                style={{ width: `${Math.max(8, (duration / maxDuration) * 100)}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-[11px] text-bw tabular-nums">
              {duration}s
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
