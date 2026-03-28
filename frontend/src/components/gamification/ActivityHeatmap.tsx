import { useMemo } from 'react'
import { HEATMAP } from '@/lib/palette'

interface SessionDay {
  date: string
  count: number
}

interface ActivityHeatmapProps {
  sessions: SessionDay[]
}

export function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
  const { cells, months } = useMemo(() => {
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
      const key = s.date.split('T')[0]
      countMap.set(key, (countMap.get(key) ?? 0) + s.count)
    }

    const cells: { date: string; count: number; col: number; row: number }[] = []
    const monthLabels: { label: string; col: number }[] = []
    let lastMonth = -1

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
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
    return { cells, months: monthLabels }
  }, [sessions])

  const getIntensityStyle = (count: number): React.CSSProperties | undefined => {
    if (count === 0) return undefined
    if (count === 1) return { backgroundColor: HEATMAP[1] }
    if (count === 2) return { backgroundColor: HEATMAP[2] }
    return { backgroundColor: HEATMAP[3] }
  }

  const numCols = Math.ceil(cells.length / 7) || 12

  return (
    <div className="p-5">
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
                    aria-label={
                      cell
                        ? `${cell.date}: ${cell.count} session${cell.count !== 1 ? 's' : ''}`
                        : undefined
                    }
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
