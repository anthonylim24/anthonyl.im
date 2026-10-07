import { useMemo, type CSSProperties } from 'react'
import { sx } from '@/styles/merge'
import { addLocalDays, formatLocalDateKey, getLocalDateKey, getLocalDayStart } from '@/lib/localDates'
import type { TechniqueId } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'
import { techniquePigment } from '../pigments'
import { pg } from '../styles/progress.stylex'

interface ActivityHeatmapProps {
  sessions: readonly CompletedSession[]
  /** Number of trailing weeks to render. */
  weeks?: number
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

function intensityStyle(count: number) {
  if (count === 1) return pg.cell1
  if (count === 2) return pg.cell2
  return pg.cell3
}

/**
 * Sessions per local day as painted dabs, Monday-start weeks. Each day is
 * dabbed in the pigment of the technique practised most that day; more
 * sessions load the brush heavier.
 */
export function ActivityHeatmap({ sessions, weeks = 12 }: ActivityHeatmapProps) {
  const { rows, monthLabels } = useMemo(() => {
    const days = new Map<string, Map<TechniqueId, number>>()
    for (const session of sessions) {
      const key = getLocalDateKey(session.date)
      if (!key) continue
      const day = days.get(key) ?? new Map<TechniqueId, number>()
      day.set(session.techniqueId, (day.get(session.techniqueId) ?? 0) + 1)
      days.set(key, day)
    }

    const today = getLocalDayStart()
    const todayKey = formatLocalDateKey(today)
    const mondayOffset = today.getDay() === 0 ? 6 : today.getDay() - 1
    const start = addLocalDays(today, -(mondayOffset + (weeks - 1) * 7))

    const weekRows: { key: string; count: number; ink: string | null; date: Date; inFuture: boolean; isToday: boolean }[][] = []
    const labels: string[] = []

    for (let week = 0; week < weeks; week++) {
      const cells = []
      for (let day = 0; day < 7; day++) {
        const date = addLocalDays(start, week * 7 + day)
        const key = formatLocalDateKey(date)
        const byTechnique = days.get(key)
        let count = 0
        let top: TechniqueId | null = null
        for (const [id, n] of byTechnique ?? []) {
          count += n
          if (!top || n > (byTechnique!.get(top) ?? 0)) top = id
        }
        cells.push({
          key,
          count,
          ink: top ? techniquePigment(top).mass : null,
          date,
          inFuture: date > today,
          isToday: key === todayKey,
        })
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
    <div {...sx(pg.heat)}>
      <div aria-label="Practice activity by day" role="img">
        <div {...sx(pg.heatGrid, pg.heatLabel)}>
          <span />
          {WEEKDAYS.map((day, index) => (
            <span key={`${day}-${index}`} {...sx(pg.heatHead)}>{day}</span>
          ))}
        </div>
        <div {...sx(pg.heatRows)}>
          {rows.map((week, weekIndex) => (
            <div key={monthLabels[weekIndex] + week[0]?.key} {...sx(pg.heatGrid)}>
              <span {...sx(pg.heatLabel)}>{monthLabels[weekIndex]}</span>
              {week.map((cell) => (
                <span
                  key={cell.key}
                  title={`${cell.key}: ${cell.count} session${cell.count === 1 ? '' : 's'}`}
                  {...sx(
                    'bf-dab',
                    pg.cell,
                    !cell.inFuture && (cell.count === 0 ? pg.cellEmpty : intensityStyle(cell.count)),
                    cell.isToday && pg.cellToday,
                  )}
                  style={cell.ink ? ({ '--bf-dab': cell.ink } as CSSProperties) : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p aria-hidden="true" {...sx(pg.heatKey)}>
        <span>Less</span>
        {[pg.cell1, pg.cell2, pg.cell3].map((style, i) => (
          <span key={i} {...sx('bf-dab', pg.keyCell, style)} style={{ '--bf-dab': 'var(--bf-mass)' } as CSSProperties} />
        ))}
        <span>More, in the day's pigment</span>
      </p>
    </div>
  )
}
