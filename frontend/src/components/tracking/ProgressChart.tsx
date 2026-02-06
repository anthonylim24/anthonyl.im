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
import { ACCENT_BRIGHT, ACCENT_SUBTLE } from '@/lib/palette'
import { TrendingUp } from 'lucide-react'

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
      <div className="sculpted-card rounded-[22px] overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/6">
          <h3 className="flex items-center gap-2.5 font-display font-bold text-white">
            <TrendingUp className="h-5 w-5 text-[#6E7BF2]" />
            {title}
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="h-64 flex items-center justify-center text-white/30 text-sm">
            Complete sessions to see your progress chart
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sculpted-card rounded-[22px] overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/6">
        <h3 className="flex items-center gap-2.5 font-display font-bold text-white">
          <TrendingUp className="h-5 w-5 text-[#6E7BF2]" />
          {title}
        </h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)', fontFamily: 'DM Sans' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.25)', fontFamily: 'DM Sans' }}
                label={{
                  value: 'Seconds',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: 'DM Sans' },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(14,18,38,0.95)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '16px',
                  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
                  padding: '12px 16px',
                  fontFamily: 'DM Sans',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, marginBottom: 4, fontFamily: 'DM Sans' }}
                itemStyle={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans' }}
              />
              <Line
                type="monotone"
                dataKey="maxHold"
                name="Best Hold"
                stroke={ACCENT_BRIGHT}
                strokeWidth={3}
                dot={{ fill: ACCENT_BRIGHT, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: ACCENT_BRIGHT, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="avgHold"
                name="Average"
                stroke={ACCENT_SUBTLE}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: ACCENT_SUBTLE, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: ACCENT_SUBTLE, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
