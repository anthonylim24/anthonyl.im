import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { LayoutGrid } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatTripDate, plural, todayIsoIn } from "../meta"
import type { Trip, TripDay } from "../types"
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

/** The days in the rail, and the scroll position that puts each one's start at the rail's scroll padding. */
function dayStops(el: HTMLElement) {
  const days = [...el.querySelectorAll<HTMLElement>(":scope > a")]
  const pad = parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0
  return { days, starts: days.map((day) => day.offsetLeft - pad) }
}

/**
 * Lengthens the rail's end just enough that scrolling all the way still rests
 * on a whole day at the start edge (`--rail-tail`, read by `railScroll`).
 */
function fitTail(el: HTMLElement) {
  const { days, starts } = dayStops(el)
  const last = days[days.length - 1]
  const tail = parseFloat(el.style.getPropertyValue("--rail-tail")) || 0
  if (!last) return
  const end = (parseFloat(getComputedStyle(el).paddingInlineEnd) || 0) - tail
  const max = last.offsetLeft + last.offsetWidth + end - el.clientWidth
  const reach = max > 0 ? starts.find((start) => start >= max - 0.5) : undefined
  el.style.setProperty("--rail-tail", `${reach === undefined ? 0 : reach - max}px`)
}

/** The resting place for the rail: the day in view near the middle, a whole day at the start edge. */
function restingLeft(el: HTMLElement, current: HTMLElement | null): number {
  if (!current) return 0
  const centred = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2
  const max = el.scrollWidth - el.clientWidth
  return dayStops(el)
    .starts.filter((start) => start <= max + 0.5)
    .reduce((best, start) => (Math.abs(start - centred) < Math.abs(best - centred) ? start : best), 0)
}

/**
 * Days that say their month where the weekday would be: the first day and
 * every 1st, and only when the trip runs into another month. The rail stays
 * one height and its scroller holds nothing but days.
 */
function monthMarks(days: readonly Pick<TripDay, "id" | "date">[]): Set<string> {
  const months = new Set(days.map((d) => d.date.slice(0, 7)))
  if (months.size < 2) return new Set()
  return new Set(days.filter((d, i) => i === 0 || d.date.slice(0, 7) !== days[i - 1]!.date.slice(0, 7)).map((d) => d.id))
}

/**
 * Overview plus one tab per day. The day in view sits near the middle, and the
 * rail always rests on a whole day at its start edge (snap, and a tail sized to
 * match), so no day is ever cut against Overview's rule. The ends fade where
 * more days hide.
 */
export function DayRail({ trip, basePath, dayId }: { trip: Trip; basePath: string; dayId: string | undefined }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState<Clipped>("none")
  const placed = useRef(false)
  const today = todayIsoIn(trip.timezone)

  // Before the scroll below, so the tail is in place when it lands.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => {
      fitTail(el)
      setClipped(clippedEnds(el))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // Day widths settle when the fonts arrive.
    for (const day of el.children) observer.observe(day)
    return () => observer.disconnect()
  }, [trip.days.length])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    // On the overview (outside the scroller) the rail rests on today during
    // the trip, else goes back to the start.
    const current = el.querySelector<HTMLElement>('[aria-current="page"]') ?? el.querySelector<HTMLElement>("[data-today]")
    // The rail's own scroll only: scrollIntoView would also move the page.
    el.scrollTo({ left: restingLeft(el, current), behavior: placed.current ? scrollBehavior() : "auto" })
    placed.current = true
  }, [dayId])

  const marks = monthMarks(trip.days)

  return (
    <nav {...sx(s.rail, "trips-glass-bar trips-glass-rail")} aria-label="Days">
      {/* Outside the scroller, so centring a late day never pushes it off. */}
      <Link to={basePath} {...sx(s.railItem, s.railAll, !dayId && s.railItemOn)} aria-current={!dayId ? "page" : undefined}>
        <LayoutGrid size={15} strokeWidth={1.75} aria-hidden />
        Overview
      </Link>
      <span {...sx(s.railRule)} aria-hidden />
      <div ref={scrollerRef} {...sx(s.railScroll, FADE[clipped])} onScroll={(event) => setClipped(clippedEnds(event.currentTarget))}>
        {trip.days.map((d, index) => (
          <Link
            key={d.id}
            to={`${basePath}/day/${d.id}`}
            {...sx(s.railItem, d.id === dayId && s.railItemOn)}
            aria-current={d.id === dayId ? "page" : undefined}
            data-today={d.date === today ? "" : undefined}
            aria-label={`Day ${index + 1}, ${formatTripDate(d.date, trip.timezone, { weekday: "long", month: "long" })}${d.date === today ? ", today" : ""}, ${plural(d.items.length, "item")}`}
          >
            {d.date === today && <span {...sx(s.railToday)} aria-hidden />}
            <span
              {...sx(s.railDow, d.items.length === 0 && d.id !== dayId && s.railEmpty, marks.has(d.id) && s.railMonth, marks.has(d.id) && d.id === dayId && s.railMonthOn)}
            >
              {marks.has(d.id)
                ? formatTripDate(d.date, trip.timezone, { weekday: undefined, month: "short", day: undefined })
                : formatTripDate(d.date, trip.timezone, { weekday: "short", month: undefined, day: undefined })}
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
