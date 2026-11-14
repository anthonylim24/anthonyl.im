import type { CSSProperties } from 'react'
import { layout } from '@/styles/common.stylex'
import { sx } from '@/styles/merge'
import { DAY_PARTS, DAY_PART_LABELS, type DayPartSummary, type Lifetime, type TechniqueCalm, type WeekTotal } from '../gamify/patterns'
import { techniquePigment } from '../pigments'
import { getProtocol } from '../protocols/catalog'
import { pg } from '../styles/progress.stylex'
import { formatLocalDate, formatMinutes } from './format'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function LifetimeFigures({ lifetime, streak }: { lifetime: Lifetime; streak: number }) {
  const figures = [
    { value: String(lifetime.sessions), label: lifetime.sessions === 1 ? 'session' : 'sessions' },
    { value: lifetime.minutes < 60 ? `${lifetime.minutes}m` : `${Math.floor(lifetime.minutes / 60)}h ${lifetime.minutes % 60}m`, label: 'breathing' },
    { value: String(streak), label: streak === 1 ? 'day streak' : 'day streak now' },
    { value: String(lifetime.longestStreak), label: lifetime.longestStreak === 1 ? 'day, longest streak' : 'days, longest streak' },
  ]
  return (
    <dl {...sx(pg.figures)}>
      {figures.map((figure) => (
        <div key={figure.label}>
          <dd {...sx(pg.figureValue)}>{figure.value}</dd>
          <dt {...sx(pg.figureLabel)}>{figure.label}</dt>
        </div>
      ))}
    </dl>
  )
}

function trendNote(weeks: readonly WeekTotal[]): string {
  const now = weeks[weeks.length - 1]?.minutes ?? 0
  const last = weeks[weeks.length - 2]?.minutes ?? 0
  if (now === 0 && last === 0) return 'Nothing in the last two weeks. One short session restarts the line.'
  if (now === 0) return `${formatMinutes(last)} last week, none yet this week.`
  if (last === 0) return `${formatMinutes(now)} this week, after a week off.`
  if (now > last) return `${formatMinutes(now)} this week, up from ${formatMinutes(last)} last week.`
  if (now < last) return `${formatMinutes(now)} so far this week; last week was ${formatMinutes(last)}.`
  return `${formatMinutes(now)} this week, level with last week.`
}

/** Minutes per week as washes of the week's pigment; this week is painted at full strength. */
export function WeeklyTrend({ weeks }: { weeks: readonly WeekTotal[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.minutes))
  return (
    <div>
      <ol {...sx(pg.trend)} aria-label="Minutes practised per week">
        {weeks.map((week, index) => {
          const current = index === weeks.length - 1
          return (
            <li key={week.startKey} {...sx(pg.trendWeek)} aria-label={`Week of ${formatLocalDate(week.startKey)}: ${plural(week.minutes, 'minute')}`}>
              {week.minutes > 0 && <span aria-hidden="true" {...sx(pg.trendValue, current && pg.trendValueNow)}>{week.minutes}</span>}
              <span
                aria-hidden="true"
                {...sx(pg.trendBar, current && pg.trendBarNow, week.minutes === 0 && pg.trendBarEmpty)}
                style={{ height: week.minutes === 0 ? '3px' : `${Math.max(6, (week.minutes / max) * 78)}%` }}
              />
              <span aria-hidden="true" {...sx(pg.trendLabel)}>{current ? 'Now' : formatLocalDate(week.startKey)}</span>
            </li>
          )
        })}
      </ol>
      <p {...sx(pg.patternNote)}>{trendNote(weeks)}</p>
    </div>
  )
}

/** Sessions by part of the day, the busiest painted darkest. */
export function DayParts({ summary }: { summary: DayPartSummary }) {
  if (!summary.top) return null
  const max = Math.max(...DAY_PARTS.map((part) => summary.counts[part]))
  const share = Math.round((summary.counts[summary.top] / summary.total) * 100)
  return (
    <div>
      <ul {...sx(pg.parts)}>
        {DAY_PARTS.map((part) => {
          const count = summary.counts[part]
          const top = part === summary.top
          return (
            <li key={part} {...sx(pg.part, top && pg.partTop)}>
              <span>{DAY_PART_LABELS[part]}</span>
              <span aria-hidden="true" {...sx(pg.partTrack)}>
                {count > 0 && <span {...sx(pg.partFill, top && pg.partFillTop)} style={{ width: `${(count / max) * 100}%` }} />}
              </span>
              <span {...sx(pg.partCount)}>
                {count}
                <span {...sx(layout.srOnly)}> {count === 1 ? 'session' : 'sessions'}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p {...sx(pg.patternNote)}>
        {share >= 50
          ? `${DAY_PART_LABELS[summary.top]} is your time: ${share}% of your sessions. A fixed slot is what makes a habit stick.`
          : `No fixed slot yet; ${DAY_PART_LABELS[summary.top].toLowerCase()} leads with ${share}%. Picking one time of day makes it easier to return.`}
      </p>
    </div>
  )
}

/** Which techniques move your calm rating most, from your own before/after ratings. */
export function CalmByTechnique({ rows }: { rows: readonly TechniqueCalm[] }) {
  if (rows.length === 0) return null
  return (
    <ul {...sx(pg.calmList)}>
      {rows.map((row) => (
        <li key={row.techniqueId} {...sx(pg.bestRow)}>
          <span
            aria-hidden="true"
            {...sx('bf-dab', pg.dab)}
            style={{ '--bf-dab': techniquePigment(row.techniqueId).mass } as CSSProperties}
          />
          <span {...sx(pg.bestName)}>{getProtocol(row.techniqueId).name}</span>
          <span {...sx(pg.calmCount)}>{plural(row.count, 'rated session')}</span>
          <span {...sx(pg.bestValue)}>
            {row.averageShift > 0 ? '+' : row.averageShift < 0 ? '−' : ''}
            {Math.abs(row.averageShift).toFixed(1)}
          </span>
        </li>
      ))}
    </ul>
  )
}
