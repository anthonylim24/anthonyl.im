import type { MoodTrend } from '@/lib/mood'

interface MoodTrendCardProps {
  trend: MoodTrend
}

/**
 * "Calm shift" — the aggregate evidence that breathing changes the user's state.
 * Shows the average tense→calm movement and how often sessions ended calmer,
 * across every session that recorded both a before and after reading.
 */
export function MoodTrendCard({ trend }: MoodTrendCardProps) {
  const calmerPercent = Math.round(trend.positiveRate * 100)
  const sign = trend.averageShift > 0 ? '+' : ''
  const shiftLabel = `${sign}${trend.averageShift.toFixed(1)}`
  const sessionLabel = trend.count === 1 ? 'session' : 'sessions'

  return (
    <div>
      <h2 className="text-[10px] font-medium tracking-[0.07em] uppercase text-bw-secondary mb-5">
        Calm shift
      </h2>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-4xl font-normal tabular-nums leading-none text-bw">
          {shiftLabel}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
          avg / session
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-bw-tertiary">
        You ended calmer in{' '}
        <span className="font-medium text-bw-secondary">{calmerPercent}%</span> of{' '}
        <span className="font-mono tabular-nums">{trend.count}</span> tracked {sessionLabel}.
      </p>
    </div>
  )
}
