import { useMemo } from 'react'
import type { CompletedSession } from '@/stores/historyStore'
import { formatLocalDate } from './format'

interface HoldChartProps {
  sessions: readonly CompletedSession[]
  /** Cap on plotted sessions (most recent, oldest → newest left → right). */
  limit?: number
}

const WIDTH = 320
const HEIGHT = 120
const PAD = 8

/** Longest-hold trend across sessions that actually held (maxHoldTime > 0). */
export function HoldChart({ sessions, limit = 20 }: HoldChartProps) {
  const points = useMemo(() => {
    return sessions
      .filter((session) => session.maxHoldTime > 0)
      .slice(0, limit)
      .reverse()
      .map((session) => ({ hold: session.maxHoldTime, date: session.date }))
  }, [sessions, limit])

  if (points.length === 0) return null

  const maxHold = Math.max(...points.map((p) => p.hold))
  const x = (index: number) =>
    points.length === 1
      ? WIDTH / 2
      : PAD + (index * (WIDTH - PAD * 2)) / (points.length - 1)
  const y = (hold: number) => HEIGHT - PAD - (hold / maxHold) * (HEIGHT - PAD * 2)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.hold).toFixed(1)}`)
    .join(' ')

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-28 w-full"
        role="img"
        aria-label={`Longest hold trend from ${first.hold} to ${last.hold} seconds across ${points.length} sessions`}
      >
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="var(--bw-chart-grid)" />
        <path d={path} fill="none" stroke="var(--bw-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.hold)} r={2.5} fill="var(--bw-accent)" />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] tabular-nums text-bw-tertiary">
        <span>{formatLocalDate(first.date)}</span>
        <span>Best {maxHold}s</span>
        <span>{formatLocalDate(last.date)}</span>
      </figcaption>
    </figure>
  )
}
