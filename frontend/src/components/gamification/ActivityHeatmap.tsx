import { useMemo } from 'react'
import { cn } from '@/lib/utils'

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

  const getIntensity = (count: number) => {
    if (count === 0) return 'bg-white/5'
    if (count === 1) return 'bg-emerald-500/30'
    if (count === 2) return 'bg-emerald-500/50'
    return 'bg-emerald-500/80'
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-0 ml-0 text-[10px] text-muted-foreground">
        {months.map((m, i) => (
          <span
            key={i}
            className="flex-shrink-0"
            style={{
              marginLeft:
                i === 0
                  ? 0
                  : `${(m.col - (months[i - 1]?.col ?? 0) - 1) * 16}px`,
            }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: 12 }, (_, col) => (
          <div key={col} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, row) => {
              const cell = cells.find((c) => c.col === col && c.row === row)
              return (
                <div
                  key={row}
                  data-cell
                  data-active={cell && cell.count > 0 ? 'true' : 'false'}
                  className={cn(
                    'w-3 h-3 rounded-[3px] transition-colors',
                    cell ? getIntensity(cell.count) : 'bg-white/5'
                  )}
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
  )
}
