import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { CompletedSession } from '@/stores/historyStore'
import { ACCENT_WARM, ACCENT_WARM_LIGHT } from '@/lib/palette'

interface ProgressChartProps {
  sessions: CompletedSession[]
  title?: string
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

  if (chartData.length === 0) {
    return (
      <div className="card-elevated rounded-[22px] overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-bw-border-subtle">
          <h3 className="font-display font-light text-bw tracking-[0.04em]">
            {title}
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="h-64 flex items-center justify-center text-bw-tertiary text-sm">
            Your hold time trends will appear here after a few sessions.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-elevated rounded-[22px] overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-bw-border-subtle">
        <h3 className="font-display font-light text-bw tracking-[0.04em]">
          {title}
        </h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bw-chart-grid)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--bw-chart-tick)', fontFamily: 'Inter' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--bw-chart-tick)', fontFamily: 'Inter' }}
                label={{
                  value: 'Seconds',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'var(--bw-chart-tick)', fontSize: 11, fontFamily: 'Inter' },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bw-tooltip-bg)',
                  border: '1px solid var(--bw-tooltip-border)',
                  borderRadius: '16px',
                  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.12)',
                  padding: '12px 16px',
                  fontFamily: 'Inter',
                }}
                labelStyle={{ color: 'var(--bw-tooltip-label)', fontWeight: 600, marginBottom: 4, fontFamily: 'Inter' }}
                itemStyle={{ color: 'var(--bw-tooltip-item)', fontFamily: 'Inter' }}
              />
              <Line
                type="monotone"
                dataKey="maxHold"
                name="Best Hold"
                stroke={ACCENT_WARM}
                strokeWidth={3}
                dot={{ fill: ACCENT_WARM, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: ACCENT_WARM, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="avgHold"
                name="Average"
                stroke={ACCENT_WARM_LIGHT}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: ACCENT_WARM_LIGHT, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: ACCENT_WARM_LIGHT, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
