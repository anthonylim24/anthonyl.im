import { useEffect, useRef } from "react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { Link } from "react-router-dom"
import { formatTripDate, todayIsoIn } from "../theme"
import { ENTER_SPRING, focusRingClass, mutedInkClass } from "../ui"
import type { TripDay } from "../types"
import { sx } from '@/lib/utils'
import { styles } from '../trips.stylex'

function weekday(date: string, timezone: string): string {
  return formatTripDate(date, timezone, { weekday: "short", month: undefined, day: undefined })
}

function dayNum(date: string, timezone: string): string {
  return formatTripDate(date, timezone, { weekday: undefined, month: undefined, day: "numeric" })
}

/**
 * A strip of date stamps; the active day wears a tilted sticker that slides
 * between them. Overview uses hash links; the day page uses routes.
 * Hidden when there is only one day so a lone trip does not grow a nav track.
 */
export function DateStrip({
  days,
  timezone,
  activeId,
  hrefFor,
  toFor,
}: {
  days: TripDay[]
  timezone: string
  activeId?: string | null
  hrefFor?: (day: TripDay) => string
  toFor?: (day: TripDay) => string
}) {
  const reduce = useReducedMotion()
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav || !activeId) return
    const chip = nav.querySelector<HTMLElement>("[aria-current]")
    if (!chip) return
    nav.scrollTo({
      left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2,
      behavior: reduce ? "auto" : "smooth",
    })
  }, [activeId, reduce, days])

  if (days.length < 2) return null
  const today = todayIsoIn(timezone)

  return (
    <nav ref={navRef} aria-label="Days" {...sx(styles.dateStripNav)}>
      <LayoutGroup id="trips-date-stamps">
        <ol {...sx(styles.dateStripList)}>
          {days.map((day, idx) => {
            const active = day.id === activeId
            const isToday = day.date === today
            const label = `Day ${idx + 1}, ${formatTripDate(day.date, timezone)}${day.title ? `, ${day.title}` : ""}`
            const chipStyles = [
              styles.dateStripChip,
              focusRingClass,
              active ? styles.dateStripChipActive : isToday ? styles.inkPrimary : mutedInkClass,
            ] as const
            const body = (
              <>
                {active ? (
                  <motion.span
                    layoutId="trips-day-sticker"
                    {...sx(styles.dateStripActiveMark)}
                    transition={reduce ? { duration: 0 } : ENTER_SPRING}
                    aria-hidden
                  />
                ) : null}
                <span {...sx(styles.dateStripWeekday)}>
                  {weekday(day.date, timezone)}
                </span>
                <span {...sx(styles.dateStripDayNum)}>
                  {dayNum(day.date, timezone)}
                </span>
                {isToday ? <span aria-hidden {...sx(styles.dateStripToday)} /> : null}
              </>
            )
            return (
              <li key={day.id} {...sx(styles.dateStripLi)}>
                {toFor ? (
                  <Link to={toFor(day)} aria-current={active ? "page" : undefined} aria-label={label} {...sx(chipStyles[0], chipStyles[1], chipStyles[2])}>
                    {body}
                  </Link>
                ) : (
                  <a
                    href={hrefFor ? hrefFor(day) : `#${day.id}`}
                    aria-current={active ? "true" : undefined}
                    aria-label={label}
                    {...sx(chipStyles[0], chipStyles[1], chipStyles[2])}
                  >
                    {body}
                  </a>
                )}
              </li>
            )
          })}
        </ol>
      </LayoutGroup>
    </nav>
  )
}
