import { Link } from "react-router-dom"
import { ACCENT, formatTripDate } from "../theme"
import { focusRingClass, mutedInkClass } from "../ui"
import type { TripDay } from "../types"

function weekday(date: string, timezone: string): string {
  return formatTripDate(date, timezone, { weekday: "short", month: undefined, day: undefined })
}

function dayNum(date: string, timezone: string): string {
  return formatTripDate(date, timezone, { weekday: undefined, month: undefined, day: "numeric" })
}

/**
 * Airbnb-style date cells. Overview uses hash links; the day page uses routes.
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
  if (days.length < 2) return null

  return (
    <nav aria-label="Days" className="overflow-x-auto touch-pan-x">
      <ol className="flex gap-1.5 pb-0.5">
        {days.map((day, idx) => {
          const active = day.id === activeId
          const label = `Day ${idx + 1}, ${formatTripDate(day.date, timezone)}${day.title ? `, ${day.title}` : ""}`
          const className = `flex h-14 min-w-12 flex-col items-center justify-center rounded-lg px-2.5 ${focusRingClass} ${
            active
              ? `${ACCENT.softBg} ${ACCENT.text}`
              : `${mutedInkClass} hover:bg-stone-200/70 hover:text-stone-900 dark:hover:bg-stone-800/70 dark:hover:text-stone-100`
          }`
          const body = (
            <>
              <span className="text-[10px] font-medium uppercase tracking-wide">{weekday(day.date, timezone)}</span>
              <span className="text-sm font-semibold tabular-nums leading-none">{dayNum(day.date, timezone)}</span>
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
    </nav>
  )
}
