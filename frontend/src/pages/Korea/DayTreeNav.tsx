import type { StyleXStyles } from '@stylexjs/stylex'
import { sx } from '@/styles/merge'
import { dayTreeNav } from './DayTreeNav.stylex'
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
  style?: StyleXStyles
}

const SPRING = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.7 }

export function DayTreeNav({ days, style }: DayTreeNavProps) {
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
      {...sx(dayTreeNav.navShell, style)}
    >
      <div
        {...sx(dayTreeNav.sce7b6109)}
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
          {...sx(dayTreeNav.s54011e7e, 'group')}
        >
          <span aria-hidden {...sx(dayTreeNav.s63da71ee)}>🇰🇷</span>
          <span>Overview</span>
        </Link>
        <div
          ref={scrollRef}
          {...sx(dayTreeNav.s21d75092)}
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
                {...sx(dayTreeNav.sf032ed6c)}
              >
                <Link
                  to={`/korea/day/${day.slug}`}
                  data-active={active}
                  data-today={isToday}
                  aria-current={active ? "page" : undefined}
                  {...sx(
                    dayTreeNav.dayLink,
                    'group',
                    active ? dayTreeNav.dayLinkActive : undefined,
                    isToday && !active ? dayTreeNav.dayLinkTodayRing : undefined,
                  )}
                >
                  <span {...sx(dayTreeNav.s63da71ee)} aria-hidden>
                    {day.emoji}
                  </span>
                  <span {...sx(dayTreeNav.sf8e652db)}>
                    <span {...sx(dayTreeNav.s8541e060)}>D{day.n}</span>
                    <span {...sx(dayTreeNav.s33548f)}>·</span>
                    {formatDate(day.date, { weekday: "short", month: undefined, day: undefined })}
                  </span>
                  {isToday && (
                    <span
                      aria-hidden
                      {...sx(dayTreeNav.sb750299f)}
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
