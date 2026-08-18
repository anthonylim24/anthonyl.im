import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { DateStrip } from "../components/DateStrip"
import type { TripDay } from "../types"
import { dayIdsFrom, daysKey } from "./hooks"

/** Which day section owns the viewport right now. */
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
        const first = dayIds.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: 0 },
    )
    for (const id of dayIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [key])

  return active
}

/**
 * Sticky Airbnb date strip. One scroll-spy so the active day is never ambiguous.
 * Hidden for a single-day trip (no nav track).
 */
export function DayNavigation({ days, timezone }: { days: TripDay[]; timezone: string }) {
  const active = useActiveDay(daysKey(days))
  const reduce = useReducedMotion()
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const rail = railRef.current
    if (!rail || !active) return
    const chip = rail.querySelector<HTMLElement>(`a[aria-current]`)
    if (!chip) return
    rail.scrollTo({
      left: chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2,
      behavior: reduce ? "auto" : "smooth",
    })
  }, [active, reduce])

  if (days.length < 2) return null

  return (
    <div
      ref={railRef}
      className="sticky top-14 z-20 -mx-4 mb-5 border-b border-[color:var(--trips-border)] bg-[color:var(--trips-surface)] px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-0"
    >
      <DateStrip days={days} timezone={timezone} activeId={active} hrefFor={(day) => `#${day.id}`} />
    </div>
  )
}
