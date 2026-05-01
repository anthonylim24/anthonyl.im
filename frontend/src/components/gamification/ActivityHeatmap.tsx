import { useMemo } from 'react'
import { formatLocalDateKey, getLocalDateKey } from '@/lib/localDates'
import { HEATMAP } from '@/lib/palette'

interface SessionDay {
  date: string
  count: number
}

interface ActivityHeatmapProps {
  sessions: SessionDay[]
}

export function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
  const { cells, months, label } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const totalDays = 84
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - totalDays + 1)
    const dayOfWeek = startDate.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    startDate.setDate(startDate.getDate() + mondayOffset)

    const countMap = new Map<string, number>()
    for (const s of sessions) {
      const key = getLocalDateKey(s.date)
      if (!key) continue
      countMap.set(key, (countMap.get(key) ?? 0) + s.count)
    }

    const cells: { date: string; count: number; col: number; row: number }[] = []
    const monthLabels: { label: string; col: number }[] = []
    let lastMonth = -1

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = formatLocalDateKey(d)
      const col = Math.floor(i / 7)
      const row = i % 7
      if (d.getMonth() !== lastMonth) {
        monthLabels.push({
          label: d.toLocaleDateString('en', { month: 'short' }),
          col,
        })
        lastMonth = d.getMonth()
      }
      cells.push({ date: key, count: countMap.get(key) ?? 0, col, row })
    }

    const activeDays = cells.filter((cell) => cell.count > 0).length
    const sessionCount = cells.reduce((sum, cell) => sum + cell.count, 0)
    const startKey = cells[0]?.date
    const endKey = cells[cells.length - 1]?.date
    const sessionLabel = `${sessionCount} session${sessionCount === 1 ? '' : 's'}`
    const activeDayLabel = `${activeDays} active day${activeDays === 1 ? '' : 's'}`
    const label = sessionCount > 0
      ? `Activity heatmap from ${startKey} to ${endKey}: ${sessionLabel} across ${activeDayLabel}.`
      : `Activity heatmap from ${startKey} to ${endKey}: no recorded sessions.`

    return { cells, months: monthLabels, label }
  }, [sessions])

  const getIntensityStyle = (count: number): React.CSSProperties | undefined => {
    if (count === 0) return undefined
    if (count === 1) return { backgroundColor: HEATMAP[1] }
    if (count === 2) return { backgroundColor: HEATMAP[2] }
    return { backgroundColor: HEATMAP[3] }
  }

  const numCols = Math.ceil(cells.length / 7) || 12

  return (
    <div className="p-5" role="img" aria-label={label}>
      <div className="space-y-2">
        {/* Month labels – positioned proportionally across the grid */}
        <div className="relative h-4 text-[10px] text-bw-tertiary font-medium">
          {months.map((m, i) => (
            <span
              key={i}
              className="absolute"
              style={{ left: `${(m.col / numCols) * 100}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
        {/* Heatmap grid – columns flex to fill width */}
        <div className="flex gap-[3px]">
          {Array.from({ length: numCols }, (_, col) => (
            <div key={col} className="flex-1 flex flex-col gap-[3px]">
              {Array.from({ length: 7 }, (_, row) => {
                const cell = cells.find((c) => c.col === col && c.row === row)
                return (
                  <div
                    key={row}
                    data-cell
                    data-active={cell && cell.count > 0 ? 'true' : 'false'}
                    className="w-full aspect-square transition-colors bg-bw-hover"
                    style={cell ? getIntensityStyle(cell.count) : undefined}
                    aria-hidden="true"
                    title={
                      cell
                        ? `${cell.date}: ${cell.count} session${cell.count !== 1 ? 's' : ''}`
                        : ''
                    }
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
