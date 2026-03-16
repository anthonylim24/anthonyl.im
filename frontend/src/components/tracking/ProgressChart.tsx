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
import { TECHNIQUE } from '@/lib/palette'

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
        <div className="p-5 sm:p-6 border-b border-zinc-100">
          <h3 className="font-display font-bold text-zinc-900">
            {title}
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="h-64 flex items-center justify-center text-zinc-400 text-sm">
            Your hold time trends will appear here after a few sessions.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-elevated rounded-[22px] overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-zinc-100">
        <h3 className="font-display font-bold text-zinc-900">
          {title}
        </h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.35)', fontFamily: 'DM Sans' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.35)', fontFamily: 'DM Sans' }}
                label={{
                  value: 'Seconds',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'rgba(0,0,0,0.35)', fontSize: 11, fontFamily: 'DM Sans' },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.97)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '16px',
                  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.12)',
                  padding: '12px 16px',
                  fontFamily: 'DM Sans',
                }}
                labelStyle={{ color: 'rgba(0,0,0,0.85)', fontWeight: 600, marginBottom: 4, fontFamily: 'DM Sans' }}
                itemStyle={{ color: 'rgba(0,0,0,0.55)', fontFamily: 'DM Sans' }}
              />
              <Line
                type="monotone"
                dataKey="maxHold"
                name="Best Hold"
                stroke={TECHNIQUE.co2.primary}
                strokeWidth={3}
                dot={{ fill: TECHNIQUE.co2.primary, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: TECHNIQUE.co2.primary, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="avgHold"
                name="Average"
                stroke={TECHNIQUE.co2.secondary}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: TECHNIQUE.co2.secondary, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: TECHNIQUE.co2.secondary, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
