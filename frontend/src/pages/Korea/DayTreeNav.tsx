import { useEffect, useRef } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import type { Day } from "./types"
import { formatDate } from "./koreaTheme"
import { todayKstIso } from "./koreaUtils"
import { ThemeToggle } from "./ThemeToggle"
import { KstClock } from "./KstClock"

interface DayTreeNavProps {
  days: Pick<Day, "n" | "slug" | "date" | "dayOfWeek" | "emoji" | "title" | "city">[]
  className?: string
}

const SPRING = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.7 }

export function DayTreeNav({ days, className }: DayTreeNavProps) {
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const today = todayKstIso()

  // active = day slug from URL OR "index"
  const match = location.pathname.match(/^\/korea\/day\/([^/]+)/)
  const activeSlug = match ? match[1] : null
  const isIndex = location.pathname === "/korea" || location.pathname === "/korea/"

  // Auto-scroll the active (or today's) chip into view
  useEffect(() => {
    if (!scrollRef.current) return
    const el =
      scrollRef.current.querySelector<HTMLElement>("[data-active='true']") ||
      scrollRef.current.querySelector<HTMLElement>("[data-today='true']")
    if (el) {
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest", inline: "center" })
    }
  }, [activeSlug, isIndex, reduceMotion])

  return (
    <nav
      aria-label="Trip day navigation"
      className={
        "sticky top-0 z-30 border-b border-stone-200/60 bg-stone-50/85 backdrop-blur-xl dark:border-stone-800/60 dark:bg-stone-950/80 " +
        (className ?? "")
      }
    >
      <div
        className="mx-auto flex max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-6"
        style={{
          // Reserve room for the iOS dynamic island / status bar when
          // launched standalone from Home Screen. env(safe-area-inset-top)
          // resolves to 0 on non-iOS.
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
          paddingBottom: "10px",
        }}
      >
        <Link
          to="/korea"
          data-active={isIndex}
          aria-current={isIndex ? "page" : undefined}
          className="group flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300/70 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-stone-300 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 data-[active=true]:border-rose-400 data-[active=true]:bg-rose-100 data-[active=true]:text-rose-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-100 dark:data-[active=true]:border-rose-700 dark:data-[active=true]:bg-rose-950/60 dark:data-[active=true]:text-rose-100"
        >
          <span aria-hidden className="text-base leading-none">🇰🇷</span>
          <span>Overview</span>
        </Link>
        <div
          ref={scrollRef}
          className="-my-1.5 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1.5 py-1.5 sm:gap-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((day, i) => {
            const active = activeSlug === day.slug
            const isToday = day.date === today
            return (
              <motion.div
                key={day.slug}
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: reduceMotion ? 0 : 0.02 * i }}
                className="shrink-0"
              >
                <Link
                  to={`/korea/day/${day.slug}`}
                  data-active={active}
                  data-today={isToday}
                  aria-current={active ? "page" : undefined}
                  className={
                    "group relative flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 data-[active=true]:border-rose-400 data-[active=true]:bg-rose-100 data-[active=true]:text-rose-900 data-[active=true]:shadow-sm dark:text-stone-400 dark:hover:border-stone-700 dark:hover:bg-stone-900 dark:hover:text-stone-100 dark:data-[active=true]:border-rose-700 dark:data-[active=true]:bg-rose-950/60 dark:data-[active=true]:text-rose-100 " +
                    (isToday && !active
                      ? "ring-2 ring-emerald-400/70 dark:ring-emerald-500/60"
                      : "")
                  }
                >
                  <span className="text-base leading-none" aria-hidden>
                    {day.emoji}
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="font-mono text-[10px] opacity-60">D{day.n}</span>
                    <span className="mx-1">·</span>
                    {formatDate(day.date, { weekday: "short", month: undefined, day: undefined })}
                  </span>
                  {isToday && (
                    <span
                      aria-hidden
                      className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-stone-50 dark:bg-rose-400 dark:ring-stone-950"
                    />
                  )}
                </Link>
              </motion.div>
            )
          })}
        </div>
        <KstClock />
        <ThemeToggle />
      </div>
    </nav>
  )
}
