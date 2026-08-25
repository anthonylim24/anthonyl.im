import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { time } from './Time.stylex'
import { useState, useRef, useEffect } from "react"

interface TimeProps {
  value: string
  style?: StyleXStyles
  prefix?: string
}

function to12Hour(value: string): { hour: number; minute: number; suffix: "AM" | "PM"; formatted: string } | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h24 = parseInt(m[1], 10)
  const minute = parseInt(m[2], 10)
  if (Number.isNaN(h24) || Number.isNaN(minute)) return null
  const suffix = h24 < 12 || h24 === 24 ? "AM" : "PM"
  const hour12Raw = h24 % 12
  const hour = hour12Raw === 0 ? 12 : hour12Raw
  const formatted = `${hour}:${String(minute).padStart(2, "0")} ${suffix}`
  return { hour, minute, suffix, formatted }
}

export function Time({ value, style, prefix }: TimeProps) {
  const twelve = to12Hour(value)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [])

  function show(persist = false) {
    setOpen(true)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (persist) {
      closeTimer.current = window.setTimeout(() => setOpen(false), 2200)
    }
  }
  function hide() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setOpen(false)
  }

  if (!twelve) {
    return (
      <span {...sx(style)}>
        {prefix}
        {value}
      </span>
    )
  }

  return (
    <span
      {...sx(time.wrapper, style)}
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={() => show(false)}
      onBlur={hide}
      onClick={() => show(true)}
      onTouchStart={() => show(true)}
      tabIndex={0}
      aria-label={`${value} (${twelve.formatted})`}
    >
      {prefix}
      <span {...sx(time.sd1fc735d)}>{value}</span>
      <span
        role="tooltip"
        {...sx(time.tooltip, open ? time.tooltipOpen : time.tooltipClosed)}
      >
        {twelve.formatted}
      </span>
    </span>
  )
}

export function LinkifyTimes({ text }: { text: string }) {
  const rx = /\b(\d{1,2}):(\d{2})\b/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<Time key={m.index} value={m[0]} />)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
