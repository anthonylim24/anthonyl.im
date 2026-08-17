import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { mutedInkClass } from "../ui"

function formatIn(timezone: string): { time: string; date: string; zone: string } {
  const now = new Date()
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(now)
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(now)
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? timezone
  return { time, date, zone }
}

export function TripClock({ timezone }: { timezone: string }) {
  const reduce = useReducedMotion()
  const [{ time, date, zone }, setNow] = useState(() => formatIn(timezone))

  useEffect(() => {
    setNow(formatIn(timezone))
    const id = setInterval(() => setNow(formatIn(timezone)), 30_000)
    return () => clearInterval(id)
  }, [timezone])

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      aria-label={`${date}, ${time} ${zone}`}
      title={`${date}, ${time} ${zone}`}
      className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${mutedInkClass}`}
    >
      <span className="font-mono-trips tabular-nums text-stone-800 dark:text-stone-200">{time}</span>
      <span className="font-mono-trips uppercase tracking-[0.12em]">{zone}</span>
    </motion.div>
  )
}
