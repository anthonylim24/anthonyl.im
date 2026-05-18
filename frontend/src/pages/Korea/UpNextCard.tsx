import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import type { Snapshot } from "./types"
import { countdownTo, formatCountdown, makeKstDate, upcomingReservations } from "./koreaUtils"
import { statusMeta, typeMeta, formatDate } from "./koreaTheme"

interface UpNextCardProps {
  snapshot: Snapshot
}

/**
 * Up-next row — what was a filled rose card now reads as a hairline
 * editorial line, paired with the countdown. The rose moment in the
 * route is the hero numeral; this is the supporting line, not a
 * second rose card competing for attention.
 */
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

  const detailLine = [
    formatDate(next.date, { weekday: "short", month: "short", day: "numeric" }),
    next.time,
    next.address,
  ]
    .filter(Boolean)
    .join("  ·  ")

  const Wrapper: React.ElementType = dayLink ? Link : "div"
  const wrapperProps: Record<string, unknown> = dayLink ? { to: `/korea/day/${dayLink}` } : {}

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      className="mx-auto mt-10 max-w-6xl px-4 sm:px-6"
    >
      <Wrapper
        {...wrapperProps}
        className="group block border-y border-stone-200/80 py-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/50 dark:border-stone-800/80"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          {/* Eyebrow with rose dot + countdown */}
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-rose-700 dark:text-rose-300">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
            Up next
            <span aria-hidden className="text-stone-300 dark:text-stone-700">·</span>
            <span className="tabular-nums">{formatCountdown(cd)}</span>
          </p>

          {/* Status label as a typographic mark, not a colored pill */}
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
            <span aria-hidden className={"mr-1.5 inline-block h-1.5 w-1.5 rounded-full " + s.dot} />
            {s.label}
          </p>
        </div>

        <div className="mt-3 flex items-baseline gap-3">
          <span aria-hidden className="text-lg leading-none" title={t.label}>
            {t.icon}
          </span>
          <p
            className="min-w-0 flex-1 break-words font-serif text-2xl font-medium leading-snug tracking-[-0.01em] text-stone-900 transition-colors group-hover:text-rose-800 sm:text-[1.6rem] dark:text-stone-100 dark:group-hover:text-rose-200"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {next.title}
          </p>
          {dayLink && (
            <ArrowUpRight
              aria-hidden
              className="h-4 w-4 shrink-0 self-center text-stone-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-rose-600 dark:group-hover:text-rose-400"
            />
          )}
        </div>

        {detailLine && (
          <p className="mt-2 break-words text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">
            {detailLine}
          </p>
        )}
      </Wrapper>
    </motion.section>
  )
}
