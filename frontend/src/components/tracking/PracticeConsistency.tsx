import { useMemo } from 'react'
import { buildPracticeConsistencyInsight } from '@/lib/practiceAnalytics'
import type { CompletedSession } from '@/stores/historyStore'
import { cn } from '@/lib/utils'

interface PracticeConsistencyProps {
  sessions: CompletedSession[]
  className?: string
}

export function PracticeConsistency({
  sessions,
  className,
}: PracticeConsistencyProps) {
  const insight = useMemo(() => buildPracticeConsistencyInsight(sessions), [sessions])
  const activeDayText = `${insight.activeDays}/7`
  const minutesText = `${insight.totalMinutes}m`
  const protocolText = insight.dominantProtocolName ?? 'No dominant protocol yet'

  return (
    <section
      aria-labelledby="practice-consistency-heading"
      className={cn('border-t border-bw-border pt-5', className)}
    >
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <h2
            id="practice-consistency-heading"
            className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary"
          >
            Practice Signal
          </h2>
          <h3 className="mt-2 font-display text-3xl font-semibold leading-none text-bw">
            {insight.label}
          </h3>
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-bw-tertiary">
            {insight.description}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 md:min-w-72">
          <div className="border-l border-bw-border pl-3">
            <div className="font-mono text-lg text-bw tabular-nums">{activeDayText}</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
              Active days
            </div>
          </div>
          <div className="border-l border-bw-border pl-3">
            <div className="font-mono text-lg text-bw tabular-nums">{minutesText}</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
              This week
            </div>
          </div>
          <div className="border-l border-bw-border pl-3">
            <div className="font-mono text-lg text-bw tabular-nums">{insight.sessionCount}</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
              Sessions
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 border-y border-bw-border py-4 sm:grid-cols-[1fr_1.5fr]">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
            Most used
          </div>
          <div className="mt-1 text-sm font-medium text-bw">{protocolText}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
            Next best action
          </div>
          <p className="mt-1 text-xs leading-relaxed text-bw-tertiary">
            {insight.nextStep}
          </p>
        </div>
      </div>
    </section>
  )
}
