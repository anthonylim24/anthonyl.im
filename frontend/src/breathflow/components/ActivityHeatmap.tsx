import { useMemo } from 'react'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { addLocalDays, formatLocalDateKey, getLocalDateKey, getLocalDayStart } from '@/lib/localDates'
import type { CompletedSession } from '@/stores/historyStore'

interface ActivityHeatmapProps {
  sessions: readonly CompletedSession[]
  /** Number of trailing weeks to render. */
  weeks?: number
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

function intensityStyle(count: number) {
  if (count === 0) return bf.heat0
  if (count === 1) return bf.heat1
  if (count === 2) return bf.heat2
  return bf.heat3
}

/** Sessions per local day, Monday-start weeks, weekday labels across the top. */
export function ActivityHeatmap({ sessions, weeks = 12 }: ActivityHeatmapProps) {
  const { rows, monthLabels } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const session of sessions) {
      const key = getLocalDateKey(session.date)
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const today = getLocalDayStart()
    const mondayOffset = today.getDay() === 0 ? 6 : today.getDay() - 1
    const start = addLocalDays(today, -(mondayOffset + (weeks - 1) * 7))

    const weekRows: { key: string; count: number; date: Date; inFuture: boolean }[][] = []
    const labels: string[] = []

    for (let week = 0; week < weeks; week++) {
      const cells = []
      for (let day = 0; day < 7; day++) {
        const date = addLocalDays(start, week * 7 + day)
        const key = formatLocalDateKey(date)
        cells.push({ key, count: counts.get(key) ?? 0, date, inFuture: date > today })
      }
      weekRows.push(cells)

      const first = cells[0]?.date
      const prev = weekRows[week - 1]?.[0]?.date
      if (!first) {
        labels.push('')
      } else if (!prev || prev.getMonth() !== first.getMonth()) {
        labels.push(first.toLocaleDateString(undefined, { month: 'short' }))
      } else {
        labels.push('')
      }
    }

    return { rows: weekRows, monthLabels: labels }
  }, [sessions, weeks])

  return (
    <div aria-label="Practice activity by day" role="img" {...sx(bf.overflowXAuto, bf.pb1Only)}>
      <div {...sx(bf.heatmapGrid, bf.mb1, bf.text10px, bf.textTertiary)}>
        <span />
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`} {...sx(bf.textCenter)}>{day}</span>
        ))}
      </div>
      <div {...sx(bf.spaceY1)}>
        {rows.map((week, weekIndex) => (
          <div
            key={monthLabels[weekIndex] + week[0]?.key}
            {...sx(bf.heatmapGrid, bf.itemsCenter)}
          >
            <span {...sx(bf.text10px, bf.textTertiary)}>{monthLabels[weekIndex]}</span>
            {week.map((cell) => (
              <div
                key={cell.key}
                title={`${cell.key}: ${cell.count} session${cell.count === 1 ? '' : 's'}`}
                {...sx(
                  bf.mxAuto3,
                  bf.h3w3,
                  cell.inFuture ? bf.bgTransparent : intensityStyle(cell.count),
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
