import { useId, useMemo } from 'react'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { pg } from '../styles/progress.stylex'
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

/**
 * Longest-hold trend across sessions that actually held (maxHoldTime > 0):
 * a brushed line over a dilute wash, each session a dab.
 */
export function HoldChart({ sessions, limit = 20 }: HoldChartProps) {
  const washId = useId()
  const points = useMemo(() => {
    return sessions
      .filter((session) => session.maxHoldTime > 0)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
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
  const wash = `${path} L ${x(points.length - 1).toFixed(1)} ${HEIGHT - PAD} L ${x(0).toFixed(1)} ${HEIGHT - PAD} Z`

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        {...sx(pg.chart)}
        role="img"
        aria-label={`Longest hold trend from ${first.hold} to ${last.hold} seconds across ${points.length} sessions`}
      >
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="var(--bw-chart-grid)" strokeDasharray="1 4" strokeLinecap="round" />
        <defs>
          <linearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bf-glaze)" stopOpacity="0.34" />
            <stop offset="1" stopColor="var(--bf-glaze)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length > 1 && <path d={wash} className="bf-ragged" fill={`url(#${washId})`} />}
        <path
          d={path}
          className="bf-brush"
          fill="none"
          stroke="var(--bf-stroke-ink)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Zero-length round-capped strokes stay circular when the viewBox stretches. */}
        {points.map((p, i) => (
          <line
            key={i}
            x1={x(i)}
            y1={y(p.hold)}
            x2={x(i)}
            y2={y(p.hold)}
            stroke="var(--bf-mass)"
            strokeWidth="7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption {...sx(bf.figcaptionRow)}>
        <span>{formatLocalDate(first.date)}</span>
        <span>Best {maxHold}s</span>
        <span>{formatLocalDate(last.date)}</span>
      </figcaption>
    </figure>
  )
}
