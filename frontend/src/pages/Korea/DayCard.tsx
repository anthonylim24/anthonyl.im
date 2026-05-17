import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import type { Day } from "./types"
import { cityMeta, formatDate } from "./koreaTheme"

interface DayCardProps {
  day: Day
  index: number
  reservationsCount: number
}

export function DayCard({ day, index, reservationsCount }: DayCardProps) {
  const reduce = useReducedMotion()
  const tint = cityMeta[day.city] ?? cityMeta.Seoul

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 24,
        mass: 0.8,
        delay: reduce ? 0 : index * 0.05,
      }}
      whileHover={
        reduce
          ? undefined
          : {
              y: -6,
              scale: 1.015,
              transition: { type: "spring", stiffness: 400, damping: 20 },
            }
      }
      whileTap={reduce ? undefined : { scale: 0.985 }}
    >
      <Link
        to={`/korea/day/${day.slug}`}
        className={
          "group block h-full overflow-hidden rounded-3xl bg-gradient-to-br ring-1 transition focus:outline-none focus:ring-2 focus:ring-rose-400 " +
          tint.tint +
          " " +
          tint.ring
        }
      >
        <div className="relative flex h-full flex-col gap-3 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Day {day.n}
              </span>
              <span className="text-stone-400 dark:text-stone-600">·</span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
                {formatDate(day.date, { month: "short", day: "numeric", weekday: "short" })}
              </span>
            </div>
            <motion.span
              aria-hidden
              className="text-3xl"
              animate={reduce ? undefined : { rotate: [0, -4, 4, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.3,
              }}
            >
              {day.emoji}
            </motion.span>
          </div>

          <h3 className="text-lg font-semibold leading-snug text-stone-900 dark:text-stone-100">
            {day.title}
          </h3>

          <p className="text-sm text-stone-700 dark:text-stone-300">{day.theme}</p>

          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
            {day.neighborhoods.slice(0, 3).map((n) => (
              <span
                key={n}
                className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-stone-700 backdrop-blur dark:bg-stone-900/50 dark:text-stone-300"
              >
                {n}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-stone-300/40 pt-3 text-xs text-stone-600 dark:border-stone-700/40 dark:text-stone-400">
            <span className="font-medium">{day.city}</span>
            <span className="flex items-center gap-1.5">
              {reservationsCount > 0 && (
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                  {reservationsCount} 📌
                </span>
              )}
              {day.weather && (
                <span className="font-mono">
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
