import { useMemo } from 'react'
import { addLocalDays, formatLocalDateKey, getLocalDateKey, getLocalDayStart } from '@/lib/localDates'
import type { CompletedSession } from '@/stores/historyStore'

interface ActivityHeatmapProps {
  sessions: readonly CompletedSession[]
  /** Number of trailing weeks to render. */
  weeks?: number
}

function intensityClass(count: number): string {
  if (count === 0) return 'bg-bw-hover'
  if (count === 1) return 'bg-bw-accent/35'
  if (count === 2) return 'bg-bw-accent/60'
  return 'bg-bw-accent'
}

/** Sessions per local day, one cell per day, one column per week. */
export function ActivityHeatmap({ sessions, weeks = 12 }: ActivityHeatmapProps) {
  const { columns, monthLabels } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const session of sessions) {
      const key = getLocalDateKey(session.date)
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const today = getLocalDayStart()
    const mondayOffset = today.getDay() === 0 ? 6 : today.getDay() - 1 // Monday = 0
    const start = addLocalDays(today, -(mondayOffset + (weeks - 1) * 7))

    const cells: { key: string; count: number; date: Date; inFuture: boolean }[] = []
    for (let offset = 0; offset < weeks * 7; offset++) {
      const date = addLocalDays(start, offset)
      const key = formatLocalDateKey(date)
      cells.push({ key, count: counts.get(key) ?? 0, date, inFuture: date > today })
    }

    const cols: (typeof cells)[] = []
    for (let i = 0; i < cells.length; i += 7) {
      cols.push(cells.slice(i, i + 7))
    }

    const labels = cols.map((col, index) => {
      const first = col[0]?.date
      if (!first) return ''
      const prev = cols[index - 1]?.[0]?.date
      const month = first.toLocaleDateString(undefined, { month: 'short' })
      if (!prev) return month
      return prev.getMonth() === first.getMonth() ? '' : month
    })

    return { columns: cols, monthLabels: labels }
  }, [sessions, weeks])

  return (
    <div aria-label="Practice activity by day" role="img" className="overflow-x-auto pb-1">
      <div className="flex gap-1">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex flex-col gap-1">
            {column.map((cell) => (
              <div
                key={cell.key}
                title={`${cell.key}: ${cell.count} session${cell.count === 1 ? '' : 's'}`}
                className={`h-3 w-3 rounded-[3px] ${cell.inFuture ? 'bg-transparent' : intensityClass(cell.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {monthLabels.map((label, index) => (
          <span key={index} className="w-3 text-[9px] text-bw-tertiary">{label}</span>
        ))}
      </div>
    </div>
  )
}
