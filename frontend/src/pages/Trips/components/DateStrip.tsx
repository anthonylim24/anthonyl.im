import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { Link } from "react-router-dom"
import { ACCENT, formatTripDate, todayIsoIn } from "../theme"
import { ENTER_SPRING, focusRingClass, mutedInkClass } from "../ui"
import type { TripDay } from "../types"

function weekday(date: string, timezone: string): string {
  return formatTripDate(date, timezone, { weekday: "short", month: undefined, day: undefined })
}

function dayNum(date: string, timezone: string): string {
  return formatTripDate(date, timezone, { weekday: undefined, month: undefined, day: "numeric" })
}

/**
 * Station-tick snap rail. Overview uses hash links; the day page uses routes.
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
  if (days.length < 2) return null
  const today = todayIsoIn(timezone)

  return (
    <nav aria-label="Days" className="overflow-x-auto touch-pan-x py-3">
      <LayoutGroup id="trips-station-rail">
        <ol className="snap-rail flex items-end gap-0">
          {days.map((day, idx) => {
            const active = day.id === activeId
            const isToday = day.date === today
            const label = `Day ${idx + 1}, ${formatTripDate(day.date, timezone)}${day.title ? `, ${day.title}` : ""}`
            const className = `relative flex min-h-14 min-w-12 flex-col items-center justify-end gap-1 px-2.5 pb-1 ${focusRingClass} ${
              active ? ACCENT.text : isToday ? "text-[color:var(--trips-ink)]" : mutedInkClass
            }`
            const body = (
              <>
                <span
                  aria-hidden
                  className={`h-2.5 w-px ${active || isToday ? "bg-[color:var(--ta)]" : "bg-[color:var(--trips-ink)]"}`}
                />
                <span className="font-display text-[10px] font-medium uppercase leading-none tracking-wide">
                  {weekday(day.date, timezone)}
                </span>
                <span className="font-display text-base font-semibold tabular-nums leading-none">
                  {dayNum(day.date, timezone)}
                </span>
                {active ? (
                  <motion.span
                    layoutId="trips-station-tick"
                    className="absolute -bottom-0.5 left-1/2 h-1.5 w-3 -translate-x-1/2 rotate-[-18deg] bg-[color:var(--ta)]"
                    transition={reduce ? { duration: 0 } : ENTER_SPRING}
                    aria-hidden
                  />
                ) : null}
              </>
            )
            return (
              <li key={day.id} className="shrink-0">
                {toFor ? (
                  <Link to={toFor(day)} aria-current={active ? "page" : undefined} aria-label={label} className={className}>
                    {body}
                  </Link>
                ) : (
                  <a
                    href={hrefFor ? hrefFor(day) : `#${day.id}`}
                    aria-current={active ? "true" : undefined}
                    aria-label={label}
                    className={className}
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
