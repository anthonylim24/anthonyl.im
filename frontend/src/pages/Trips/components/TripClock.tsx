import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { mutedInkClass } from "../ui"
import { FlipTime } from "./FlipTime"

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

export function TripClock({ timezone, tone = "sheet" }: { timezone: string; tone?: "sheet" | "band" }) {
  const reduce = useReducedMotion()
  const [{ time, date, zone }, setNow] = useState(() => formatIn(timezone))
  const onBand = tone === "band"

  useEffect(() => {
    const tick = () => {
      const next = formatIn(timezone)
      setNow((prev) =>
        prev.time === next.time && prev.date === next.date && prev.zone === next.zone ? prev : next,
      )
    }
    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [timezone])

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      aria-label={`${date}, ${time} ${zone}`}
      title={`${date}, ${time} ${zone}`}
      className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${
        onBand ? "text-[color:var(--trips-band-ink)]/75" : mutedInkClass
      }`}
    >
      <FlipTime
        value={time}
        className={`font-display tabular-nums ${onBand ? "text-[color:var(--trips-band-ink)]" : "text-[color:var(--trips-ink)]"}`}
      />
      <span className="font-display uppercase tracking-[0.12em]">
        {(timezone.split("/").pop() ?? zone).replace(/_/g, " ")}
      </span>
    </motion.div>
  )
}
