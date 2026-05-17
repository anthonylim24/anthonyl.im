import { useState, useRef, useEffect } from "react"

interface TimeProps {
  // 24-hour time string like "06:33" or "18:00".
  value: string
  // Optional className applied to the inline wrapper.
  className?: string
  // Optional prefix that renders before the time (e.g. "leaves at ").
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

// Renders a 24-hour time value with a hoverable / tappable AM/PM tooltip.
// On desktop, hover or focus reveals the 12-hour version above the time.
// On touch, a tap reveals it for ~2 seconds.
export function Time({ value, className, prefix }: TimeProps) {
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
      <span className={className}>
        {prefix}
        {value}
      </span>
    )
  }

  return (
    <span
      className={
        "relative inline-block cursor-help underline decoration-stone-400/40 decoration-dotted underline-offset-2 transition hover:decoration-rose-500/70 " +
        (className ?? "")
      }
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
      <span className="tabular-nums">{value}</span>
      <span
        role="tooltip"
        className={
          "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-stone-900 px-2 py-0.5 text-[10px] font-medium text-white shadow-lg transition-opacity duration-150 dark:bg-stone-100 dark:text-stone-900 " +
          (open ? "opacity-100" : "opacity-0")
        }
      >
        {twelve.formatted}
      </span>
    </span>
  )
}

// Detect HH:mm substrings within a longer string and wrap each with <Time>.
// Returns a JSX fragment. Useful for "06:33 → 09:22" style subtitles.
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
