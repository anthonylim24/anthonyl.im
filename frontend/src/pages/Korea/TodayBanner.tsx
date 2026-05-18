import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import type { Day } from "./types"
import { formatDate } from "./koreaTheme"

interface TodayBannerProps {
  today: Day
}

/**
 * Today banner — the loudest single state in the app. It used to be an
 * emerald pill competing with rose for brand identity. Now it IS the
 * rose moment: a single editorial line with a filled rose dot, ink
 * Cormorant title, hairline rule beneath. No emoji wiggle, no green.
 */
export function TodayBanner({ today }: TodayBannerProps) {
  const reduce = useReducedMotion()
  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto mt-8 max-w-6xl px-4 sm:px-6"
    >
      <Link
        to={`/korea/day/${today.slug}`}
        className="group block border-y border-stone-200/80 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/50 dark:border-stone-800/80"
      >
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-rose-700 dark:text-rose-300">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
            Today
            <span aria-hidden className="text-stone-300 dark:text-stone-700">·</span>
            <span className="text-stone-500 dark:text-stone-500">
              {formatDate(today.date, { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </p>
          <p
            className="break-words font-serif text-lg font-medium leading-snug text-stone-900 transition-colors group-hover:text-rose-800 sm:text-xl dark:text-stone-100 dark:group-hover:text-rose-200"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            <span aria-hidden className="mr-2 text-base opacity-90">
              {today.emoji}
            </span>
            Day {today.n}, {today.title}
          </p>
          <span aria-hidden className="ml-auto hidden font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 transition-colors group-hover:text-rose-700 sm:inline dark:text-stone-500 dark:group-hover:text-rose-300">
            Open →
          </span>
        </div>
      </Link>
    </motion.aside>
  )
}
