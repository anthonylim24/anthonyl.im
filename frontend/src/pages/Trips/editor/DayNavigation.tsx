import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { ACCENT, formatTripDate } from "../theme"
import { focusRingClass, mutedInkClass, overlayHoverClass } from "../ui"
import type { TripDay } from "../types"
import { dayIdsFrom, daysKey } from "./hooks"

/** Which day section owns the viewport right now. The first intersecting
 *  section in itinerary order wins, so scrolling never flickers between two. */
function useActiveDay(key: string): string | null {
  const [active, setActive] = useState<string | null>(() => dayIdsFrom(key)[0] ?? null)

  useEffect(() => {
    const dayIds = dayIdsFrom(key)
    if (dayIds.length === 0) return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        // Keep the last answer when nothing is in the band (page top/bottom).
        const first = dayIds.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      // Top band only: a day counts as active once its header clears the
      // sticky chrome and until the next one takes over.
      { rootMargin: "-160px 0px -55% 0px", threshold: 0 },
    )
    for (const id of dayIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [key])

  return active
}

function bookedCount(day: TripDay): number {
  let n = 0
  for (const item of day.items) if (item.status === "booked") n += 1
  return n
}

const chipBase = `inline-flex h-11 min-w-11 items-center justify-center rounded-[var(--tr-r-control)] px-2.5 text-xs font-medium tabular-nums ${focusRingClass}`
const railLinkBase = `flex min-h-11 items-center gap-1.5 rounded-[var(--tr-r-control)] px-2 py-1.5 text-[13px] ${focusRingClass}`

/**
 * Day navigation in two shapes: a sticky chip rail below `lg` and the
 * desktop rail. Both share one scroll-spy so the active day is never
 * ambiguous.
 */
export function DayNavigation({ days, timezone }: { days: TripDay[]; timezone: string }) {
  const active = useActiveDay(daysKey(days))
  const reduce = useReducedMotion()
  const chipRailRef = useRef<HTMLOListElement>(null)

  // Keep the active chip in view as the page scrolls, without moving the page.
  useEffect(() => {
    const rail = chipRailRef.current
    if (!rail || !active) return
    const chip = rail.querySelector<HTMLElement>(`[data-day-chip="${CSS.escape(active)}"]`)
    if (!chip) return
    rail.scrollTo({
      left: chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2,
      behavior: reduce ? "auto" : "smooth",
    })
  }, [active, reduce])

  if (days.length < 2) return null

  return (
    <>
      <nav
        aria-label="Days"
        className="sticky top-[7.25rem] z-20 -mx-4 mb-4 border-b border-[color:var(--tr-line)] bg-[color-mix(in_srgb,var(--tr-canvas)_88%,transparent)] px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden"
      >
        <ol ref={chipRailRef} className="flex snap-x gap-1.5 overflow-x-auto touch-pan-x pb-0.5">
          {days.map((day, idx) => {
            const isActive = day.id === active
            return (
              <li key={day.id} className="snap-start">
                <a
                  href={`#${day.id}`}
                  data-day-chip={day.id}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`Day ${idx + 1}, ${formatTripDate(day.date, timezone)}`}
                  className={`${chipBase} ${
                    isActive ? `${ACCENT.softBg} ${ACCENT.text}` : `${mutedInkClass} ${overlayHoverClass}`
                  }`}
                >
                  D{idx + 1}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      <nav aria-label="Days" className="hidden lg:block lg:w-44 lg:shrink-0">
        <ol className="sticky top-[7.25rem] space-y-0.5 border-l border-[color:var(--tr-line)] pl-3">
          {days.map((day, idx) => {
            const isActive = day.id === active
            const booked = bookedCount(day)
            return (
              <li key={day.id} className="relative">
                {isActive && <span aria-hidden className={`absolute -left-[13px] inset-y-1 w-px ${ACCENT.hairline}`} />}
                <a
                  href={`#${day.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`${railLinkBase} ${
                    isActive
                      ? `${ACCENT.softBg} ${ACCENT.text} font-medium`
                      : `${mutedInkClass} ${overlayHoverClass} hover:text-[color:var(--tr-ink)]`
                  }`}
                >
                  <span className="shrink-0 font-medium">Day {idx + 1}</span>
                  <span className="truncate text-xs opacity-80">
                    {formatTripDate(day.date, timezone, { weekday: undefined })}
                  </span>
                  {booked > 0 && (
                    <span
                      className="ml-auto shrink-0 font-mono-trips text-[10px] tabular-nums text-[color:var(--tr-ink-muted)]"
                      title={`${booked} booked`}
                    >
                      {booked}
                    </span>
                  )}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}
