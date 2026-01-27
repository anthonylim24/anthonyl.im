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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CompletedSession } from '@/stores/historyStore'

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
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Complete sessions to see your progress chart
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                label={{
                  value: 'Seconds',
                  angle: -90,
                  position: 'insideLeft',
                  className: 'text-muted-foreground',
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Line
                type="monotone"
                dataKey="maxHold"
                name="Best Hold"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
              <Line
                type="monotone"
                dataKey="avgHold"
                name="Average"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: 'hsl(var(--muted-foreground))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
