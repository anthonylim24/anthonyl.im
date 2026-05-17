import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import type { Snapshot } from "./types"
import { countdownTo, formatCountdown, makeKstDate, upcomingReservations } from "./koreaUtils"
import { statusMeta, typeMeta, formatDate } from "./koreaTheme"

interface UpNextCardProps {
  snapshot: Snapshot
}

export function UpNextCard({ snapshot }: UpNextCardProps) {
  const reduce = useReducedMotion()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const upcoming = upcomingReservations(snapshot, 1)
  const next = upcoming[0]
  if (!next) return null

  const target = makeKstDate(next.date, next.time ?? "12:00")
  const cd = countdownTo(target, now)
  const s = statusMeta[next.status]
  const t = typeMeta[next.type]
  const dayLink = next.dayNumber ? snapshot.days.find((d) => d.n === next.dayNumber)?.slug : undefined

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.4 }}
      className="mx-auto mt-8 max-w-6xl px-4 sm:px-6"
    >
      <div className="relative overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50 via-amber-50 to-stone-50 p-5 shadow-sm dark:border-rose-900/40 dark:from-rose-950/30 dark:via-amber-950/20 dark:to-stone-950">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-rose-300/30 blur-2xl dark:bg-rose-700/20"
          animate={reduce ? undefined : { scale: [1, 1.15, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3 sm:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm dark:bg-stone-900">
              {t.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono uppercase tracking-widest text-rose-700 dark:text-rose-300">
                Up next · {formatCountdown(cd)}
              </p>
              <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                {next.title}
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {formatDate(next.date, { weekday: "short", month: "short", day: "numeric" })}
                {next.time ? ` · ${next.time}` : ""}
                {next.address ? ` · ${next.address}` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
            <span
              className={
                "rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider " + s.chip
              }
            >
              {s.label}
            </span>
            {dayLink && (
              <Link
                to={`/korea/day/${dayLink}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
              >
                Open day →
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  )
}
