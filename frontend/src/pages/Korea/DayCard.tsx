import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import type { Day } from "./types"
import { cityMeta, formatDate } from "./koreaTheme"
import { isPastDate } from "./koreaUtils"

interface DayCardProps {
  day: Day
  index: number
  reservationsCount: number
  isToday?: boolean
}

export function DayCard({ day, index, reservationsCount, isToday = false }: DayCardProps) {
  const reduce = useReducedMotion()
  const cityTag = cityMeta[day.city]?.tag ?? day.city.slice(0, 2).toUpperCase()
  const isPast = !isToday && isPastDate(day.date)

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 26,
        delay: reduce ? 0 : index * 0.04,
      }}
      whileHover={reduce ? undefined : { y: -2, transition: { duration: 0.18 } }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
    >
      <Link
        to={`/korea/day/${day.slug}`}
        className={
          "group relative block h-full overflow-hidden rounded-3xl border bg-stone-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 dark:bg-stone-900/40 " +
          (isToday
            ? "border-rose-400/70 dark:border-rose-500/60"
            : "border-stone-200/80 hover:border-stone-300 dark:border-stone-800/80 dark:hover:border-stone-700") +
          (isPast ? " opacity-60" : "")
        }
      >
        {isToday && (
          <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
            Today
          </span>
        )}

        <div className="relative flex h-full flex-col gap-4 p-5 sm:p-6">
          {/* Header row: city tag + day numeral + date. Type carries the
              identity now that the gradient hue is gone. */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <span
                aria-label={day.city}
                title={day.city}
                className="font-mono text-[11px] font-semibold tracking-[0.18em] text-stone-500 dark:text-stone-400"
              >
                {cityTag}
              </span>
              <span aria-hidden className="text-stone-300 dark:text-stone-700">·</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                Day {String(day.n).padStart(2, "0")}
              </span>
            </div>
            <span aria-hidden className="text-2xl leading-none opacity-90">
              {day.emoji}
            </span>
          </div>

          {/* Headline */}
          <h3
            className="break-words font-serif text-2xl font-medium leading-tight tracking-[-0.01em] text-stone-900 sm:text-[1.7rem] dark:text-stone-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {day.title}
          </h3>

          {/* Theme */}
          <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{day.theme}</p>

          {/* Neighborhoods — inline prose with `·` separators, no chip
              ring. Less noise. */}
          {day.neighborhoods.length > 0 && (
            <p className="text-xs text-stone-500 dark:text-stone-500">
              {day.neighborhoods.slice(0, 3).join("  ·  ")}
            </p>
          )}

          {/* Meta footer — single hairline rule. Date + reservations
              count + weather. Reservation count is a small rose mark
              (not a pill). */}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-stone-200/80 pt-3 text-[11px] text-stone-500 dark:border-stone-800/80 dark:text-stone-500">
            <span className="font-mono uppercase tracking-[0.16em]">
              {formatDate(day.date, { month: "short", day: "numeric", weekday: "short" })}
            </span>
            <span className="flex items-center gap-3">
              {reservationsCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                  <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-rose-500 dark:bg-rose-400" />
                  {reservationsCount} booked
                </span>
              )}
              {day.weather && (
                <span className="font-mono tabular-nums text-stone-500 dark:text-stone-500">
                  {day.weather.highC}° / {day.weather.lowC}°
                </span>
              )}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
