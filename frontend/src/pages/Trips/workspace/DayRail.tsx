import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { LayoutGrid } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatTripDate, plural, todayIsoIn } from "../meta"
import type { Trip } from "../types"
import { ws as s } from "../workspace.stylex"
import { scrollBehavior } from "./scroll"

/** Which ends of the rail have days scrolled out of sight. */
type Clipped = "none" | "start" | "end" | "both"

function clippedEnds(el: HTMLElement): Clipped {
  const start = el.scrollLeft > 1
  const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  return start && end ? "both" : start ? "start" : end ? "end" : "none"
}

const FADE = { none: null, start: s.railFadeStart, end: s.railFadeEnd, both: s.railFadeBoth } as const

/** Overview plus one tab per day; the day in view is centred and the ends fade where more days hide. */
export function DayRail({ trip, basePath, dayId }: { trip: Trip; basePath: string; dayId: string | undefined }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState<Clipped>("none")
  const placed = useRef(false)
  const today = todayIsoIn(trip.timezone)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => setClipped(clippedEnds(el))
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [trip.days.length])

  useEffect(() => {
    const el = scrollerRef.current
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !current) return
    // The rail's own scroll only: scrollIntoView would also move the page.
    el.scrollTo({
      left: current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2,
      behavior: placed.current ? scrollBehavior() : "auto",
    })
    placed.current = true
  }, [dayId])

  return (
    <nav {...sx(s.rail)} aria-label="Days">
      <div ref={scrollerRef} {...sx(s.railScroll, FADE[clipped])} onScroll={(event) => setClipped(clippedEnds(event.currentTarget))}>
        <Link to={basePath} {...sx(s.railItem, s.railAll, !dayId && s.railItemOn)} aria-current={!dayId ? "page" : undefined}>
          <LayoutGrid size={15} strokeWidth={1.75} aria-hidden />
          Overview
        </Link>
        {trip.days.map((d, index) => (
          <Link
            key={d.id}
            to={`${basePath}/day/${d.id}`}
            {...sx(s.railItem, d.id === dayId && s.railItemOn)}
            aria-current={d.id === dayId ? "page" : undefined}
            aria-label={`Day ${index + 1}, ${formatTripDate(d.date, trip.timezone, { weekday: "long", month: "long" })}${d.date === today ? ", today" : ""}, ${plural(d.items.length, "item")}`}
          >
            {d.date === today && <span {...sx(s.railToday)} aria-hidden />}
            <span {...sx(s.railDow, d.items.length === 0 && d.id !== dayId && s.railEmpty)}>
              {formatTripDate(d.date, trip.timezone, { weekday: "short", month: undefined, day: undefined })}
            </span>
            <span {...sx(s.railNum, d.items.length === 0 && d.id !== dayId && s.railEmpty)}>
              {formatTripDate(d.date, trip.timezone, { weekday: undefined, month: undefined, day: "numeric" })}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
