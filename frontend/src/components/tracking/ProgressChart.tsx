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
import { TrendingUp } from 'lucide-react'

interface ProgressChartProps {
  sessions: CompletedSession[]
  title?: string
}

export function ProgressChart({
  sessions,
  title = 'Hold Time Progress',
}: ProgressChartProps) {
  // Memoize chart data transformation - combined into single efficient loop
  const chartData = useMemo(() => {
    const result = []
    const start = Math.max(0, sessions.length - 14)

    // Single reverse iteration instead of reverse().slice().map()
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
      <div className="liquid-glass-breath rounded-3xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/20">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <TrendingUp className="h-5 w-5 text-[#2dd4bf]" />
            {title}
          </h3>
        </div>
        <div className="p-5 sm:p-6">
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Complete sessions to see your progress chart
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="liquid-glass-breath rounded-3xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-white/20">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <TrendingUp className="h-5 w-5 text-[#2dd4bf]" />
          {title}
        </h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                label={{
                  value: 'Seconds',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'hsl(var(--muted-foreground))', fontSize: 12 },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  borderRadius: '16px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                  padding: '12px 16px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Line
                type="monotone"
                dataKey="maxHold"
                name="Best Hold"
                stroke="#ff7170"
                strokeWidth={3}
                dot={{ fill: '#ff7170', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: '#ff7170', strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="avgHold"
                name="Average"
                stroke="#60a5fa"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#60a5fa', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: '#60a5fa', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
