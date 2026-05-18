import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { Sparkles } from "lucide-react"
import type { Day } from "./types"
import { formatDate } from "./koreaTheme"

interface TodayBannerProps {
  today: Day
}

export function TodayBanner({ today }: TodayBannerProps) {
  const reduce = useReducedMotion()
  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="mx-auto mt-6 max-w-6xl px-4 sm:px-6"
    >
      <Link
        to={`/korea/day/${today.slug}`}
        className="group flex items-center gap-3 rounded-full border border-emerald-300/70 bg-emerald-50/80 px-4 py-2.5 transition hover:border-emerald-400 hover:bg-emerald-100/80 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
      >
        <motion.span
          aria-hidden
          className="text-2xl"
          animate={reduce ? undefined : { rotate: [0, 8, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {today.emoji}
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
            <Sparkles className="h-3 w-3" aria-hidden /> Today · {formatDate(today.date, { weekday: "short", month: "short", day: "numeric" })}
          </p>
          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
            Day {today.n} · {today.title}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-emerald-800 transition group-hover:translate-x-0.5 dark:text-emerald-300">
          Open →
        </span>
      </Link>
    </motion.aside>
  )
}
