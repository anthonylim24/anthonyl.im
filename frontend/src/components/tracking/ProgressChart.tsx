import { useMemo } from 'react'
import type { CompletedSession } from '@/stores/historyStore'
import { ACCENT_WARM, ACCENT_WARM_LIGHT } from '@/lib/palette'

interface ProgressChartProps {
  sessions: CompletedSession[]
  title?: string
}

interface ChartPoint {
  session: number
  date: string
  maxHold: number
  avgHold: number
}

const CHART_WIDTH = 640
const CHART_HEIGHT = 256
const CHART_PADDING = {
  top: 18,
  right: 18,
  bottom: 36,
  left: 48,
}

const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
const plotBottom = CHART_HEIGHT - CHART_PADDING.bottom

function getYMax(chartData: ChartPoint[]): number {
  const maxValue = Math.max(
    10,
    ...chartData.flatMap((entry) => [entry.maxHold, entry.avgHold]),
  )
  return Math.ceil(maxValue / 10) * 10
}

function getPointCoordinates(chartData: ChartPoint[], yMax: number, key: 'maxHold' | 'avgHold') {
  const denominator = Math.max(1, chartData.length - 1)

  return chartData.map((entry, index) => {
    const x = CHART_PADDING.left + (index / denominator) * plotWidth
    const y = plotBottom - (entry[key] / yMax) * plotHeight
    return {
      x,
      y,
      value: entry[key],
      date: entry.date,
    }
  })
}

function pointsToPath(points: ReturnType<typeof getPointCoordinates>): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
}

export function ProgressChart({
  sessions,
  title = 'Hold Time Progress',
}: ProgressChartProps) {
  const chartData = useMemo(() => {
    const result = []
    const start = Math.max(0, sessions.length - 14)

    for (let i = sessions.length - 1; i >= start; i--) {
      const session = sessions[i]
      result.push({
        session: sessions.length - i,
        date: new Date(session.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        maxHold: session.maxHoldTime,
        avgHold: session.avgHoldTime,
      })
    }
    return result
  }, [sessions])
  const chartLabel = useMemo(() => {
    if (chartData.length === 0) {
      return `${title}: no hold-time sessions recorded yet.`
    }

    const firstSession = chartData[0]
    const latestSession = chartData[chartData.length - 1]
    const bestHold = Math.max(...chartData.map((entry) => entry.maxHold))
    const latestAverage = latestSession.avgHold
    const sessionLabel = `${chartData.length} session${chartData.length === 1 ? '' : 's'}`

    return [
      `${title}: ${sessionLabel} from ${firstSession.date} to ${latestSession.date}.`,
      `Best hold ${bestHold} seconds.`,
      `Latest average ${latestAverage} seconds.`,
    ].join(' ')
  }, [chartData, title])

  if (chartData.length === 0) {
    return (
      <div className="overflow-hidden">
        <div className="pb-4 border-b border-bw-border">
          <h3 className="font-display text-2xl font-semibold text-bw leading-none">
            {title}
          </h3>
        </div>
        <div className="pt-4">
          <div
            className="h-64 flex items-center justify-center text-bw-tertiary text-sm"
            role="status"
            aria-label={chartLabel}
          >
            Your hold time trends will appear here after a few sessions.
          </div>
        </div>
      </div>
    )
  }

  const yMax = getYMax(chartData)
  const maxHoldPoints = getPointCoordinates(chartData, yMax, 'maxHold')
  const avgHoldPoints = getPointCoordinates(chartData, yMax, 'avgHold')
  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = Math.round(yMax * (1 - ratio))
    const y = CHART_PADDING.top + ratio * plotHeight
    return { value, y }
  })
  const xTicks = chartData.length > 1
    ? [chartData[0], chartData[chartData.length - 1]]
    : [chartData[0]]

  return (
    <div className="overflow-hidden">
      <div className="pb-4 border-b border-bw-border">
        <h3 className="font-display text-2xl font-semibold text-bw leading-none">
          {title}
        </h3>
      </div>
      <div className="pt-4">
        <div className="h-64" role="img" aria-label={chartLabel}>
          <svg
            data-testid="progress-chart-svg"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-full w-full overflow-visible"
            aria-hidden="true"
          >
            {gridTicks.map(({ value, y }) => (
              <g key={value}>
                <line
                  x1={CHART_PADDING.left}
                  x2={CHART_WIDTH - CHART_PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="var(--bw-chart-grid)"
                  strokeWidth="1"
                />
                <text
                  x={CHART_PADDING.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[color:var(--bw-chart-tick)] font-mono text-[11px]"
                >
                  {value}
                </text>
              </g>
            ))}
            <line
              x1={CHART_PADDING.left}
              x2={CHART_PADDING.left}
              y1={CHART_PADDING.top}
              y2={plotBottom}
              stroke="var(--bw-chart-grid)"
              strokeWidth="1"
            />
            {xTicks.map((entry, index) => (
              <text
                key={`${entry.date}-${index}`}
                x={chartData.length > 1 && index === xTicks.length - 1
                  ? CHART_WIDTH - CHART_PADDING.right
                  : CHART_PADDING.left}
                y={CHART_HEIGHT - 10}
                textAnchor={chartData.length > 1 && index === xTicks.length - 1 ? 'end' : 'start'}
                className="fill-[color:var(--bw-chart-tick)] font-mono text-[11px]"
              >
                {entry.date}
              </text>
            ))}
            <path
              data-series="max-hold"
              d={pointsToPath(maxHoldPoints)}
              fill="none"
              stroke={ACCENT_WARM}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <path
              data-series="avg-hold"
              d={pointsToPath(avgHoldPoints)}
              fill="none"
              stroke={ACCENT_WARM_LIGHT}
              strokeDasharray="6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            {maxHoldPoints.map((point) => (
              <circle
                key={`max-${point.date}-${point.value}`}
                cx={point.x}
                cy={point.y}
                r="4"
                fill={ACCENT_WARM}
              />
            ))}
            {avgHoldPoints.map((point) => (
              <circle
                key={`avg-${point.date}-${point.value}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={ACCENT_WARM_LIGHT}
              />
            ))}
          </svg>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
            <span className="inline-flex items-center gap-2">
              <span className="h-px w-5 bg-bw-accent" aria-hidden="true" />
              Best hold
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="h-px w-5"
                style={{
                  backgroundImage: `linear-gradient(to right, ${ACCENT_WARM_LIGHT} 45%, transparent 45%)`,
                  backgroundSize: '8px 1px',
                }}
                aria-hidden="true"
              />
              Average
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
