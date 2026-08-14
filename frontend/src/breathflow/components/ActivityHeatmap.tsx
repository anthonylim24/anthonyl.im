import { useMemo } from 'react'
import { addLocalDays, formatLocalDateKey, getLocalDateKey, getLocalDayStart } from '@/lib/localDates'
import type { CompletedSession } from '@/stores/historyStore'

interface ActivityHeatmapProps {
  sessions: readonly CompletedSession[]
  /** Number of trailing weeks to render. */
  weeks?: number
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

function intensityClass(count: number): string {
  if (count === 0) return 'bg-bw-hover'
  if (count === 1) return 'bg-bw-accent/35'
  if (count === 2) return 'bg-bw-accent/60'
  return 'bg-bw-accent'
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
    <div aria-label="Practice activity by day" role="img" className="overflow-x-auto pb-1">
      <div className="mb-1.5 grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-1 text-[10px] text-bw-tertiary">
        <span />
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`} className="text-center">{day}</span>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((week, weekIndex) => (
          <div
            key={monthLabels[weekIndex] + week[0]?.key}
            className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] items-center gap-1"
          >
            <span className="text-[10px] text-bw-tertiary">{monthLabels[weekIndex]}</span>
            {week.map((cell) => (
              <div
                key={cell.key}
                title={`${cell.key}: ${cell.count} session${cell.count === 1 ? '' : 's'}`}
                className={`mx-auto h-3 w-3 ${cell.inFuture ? 'bg-transparent' : intensityClass(cell.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
