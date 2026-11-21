import { clockMinutes, dayEnd, dayStarts } from "../dayClock"
import { dayPins, distanceMeters, isLocated, splitDay } from "../map/geo"
import { formatClock } from "../meta"
import type { ItineraryItem, TripDay } from "../types"
import { formatMinutes, MIN_LEG_METERS, travelEstimate, type TravelEstimate } from "./travel"

// Pure layout for the day timeline: which stops sit on the clock, how long
// each one probably takes, where they collide, and what lies between them.
// All times are minutes from the day's midnight on the day's own clock
// (`dayClock.ts`): past midnight runs on, so a 01:30 bar after dinner is 1530.

export { clockMinutes }

/**
 * What became of a stop: still planned, marked done, or skipped. Done is
 * done whatever the clock says; a skipped stop is not happening, so it is
 * never next, never in a clash and never on a leg, but it stays in view, struck.
 */
export type Outcome = "planned" | "done" | "skipped"

export function outcomeOf(item: Pick<ItineraryItem, "status">): Outcome {
  return item.status === "completed" ? "done" : item.status === "skipped" ? "skipped" : "planned"
}

/**
 * Each planned item's start on the day's clock (`dayStarts`), indexed like
 * `splitDay(day).planned`; null when untimed. Headings never set the clock.
 * Live, the list, the timeline and the calendar all read starts through here.
 */
export function planStarts(day: Pick<TripDay, "items">): (number | null)[] {
  return dayStarts(splitDay(day).planned.map((item) => (item.kind === "section" ? {} : item)))
}

export interface TimelineBlock {
  itemId: string
  start: number
  end: number
  /** Side-by-side column for stops that overlap, from 0. */
  lane: number
  /** Columns in this block's overlap cluster (1 when it overlaps nothing). */
  lanes: number
  /** No end time was given: `end` is a guess from the kind of stop. */
  estimated: boolean
  /** A flight or train with no end time: drawn as its departure, never as a guessed journey. */
  departs: boolean
  outcome: Outcome
}

export interface TimelineGap {
  from: number
  to: number
  afterId: string
  beforeId: string
  /** Between two pinned stops more than a few steps apart. */
  travel?: TravelEstimate
  /** Minutes left once the travel is done. */
  free: number
}

export interface TimelineConflict {
  /** [earlier stop, later stop]. The later one carries the warning. */
  ids: [string, string]
  kind: "overlap" | "tight"
  /** "Overlaps Gyeongbokgung", "Tight · ~35 min by transit, 15 min gap". */
  detail: string
}

export interface DayLayout {
  /** The ruler's window: on whole hours, from the first stop's hour, at least three hours long. */
  start: number
  end: number
  blocks: TimelineBlock[]
  gaps: TimelineGap[]
  /** Stops with no usable time, then everything under "To schedule", in itinerary order. */
  untimed: string[]
  conflicts: TimelineConflict[]
}

const DAY = 24 * 60
const MIN_WINDOW = 3 * 60
/** The window used when nothing is on the clock (only the empty state reads it). */
const EMPTY_WINDOW = 6 * 60
/** The ruler stops at 06:00 the next morning; a stay that runs on is drawn to the edge. */
const LATEST_END = DAY + 6 * 60
/** A stop with a guessed length keeps at least this long before it gives way to the next. */
const MIN_ESTIMATE = 15
const EMPTY_START = 9 * 60

/** Typical minutes at a stop, by booking type or place category. */
const TYPICAL_MINUTES: Record<string, number> = {
  // A flight with no arrival is drawn as its departure: its length is unknown and often crosses zones.
  flight: 45,
  hotel: 30,
  meal: 75,
  restaurant: 75,
  cafe: 45,
  bakery: 45,
  bar: 90,
  museum: 120,
  palace: 120,
  gallery: 120,
  park: 90,
  garden: 90,
  hike: 90,
  shopping: 60,
  market: 60,
}
export const DEFAULT_STOP_MINUTES = 60

/** Minutes from midnight → "9:30 AM". Past midnight wraps (1530 → "1:30 AM"). */
export function clockLabel(minutes: number): string {
  const wrapped = ((Math.round(minutes) % DAY) + DAY) % DAY
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0")
  const mm = String(wrapped % 60).padStart(2, "0")
  return formatClock(`${hh}:${mm}`)
}

/**
 * A span of the clock. `card`: "11:00 AM–12:00 PM", minutes always, so a list of
 * them lines up. `lane`: "11:00–12:00" for a narrow column under a ruler that
 * already says AM or PM. `prose`: "2–5 PM" in a sentence.
 */
export function clockRange(from: number, to: number, style: "card" | "lane" | "prose" = "card"): string {
  const [a, b] = [clockLabel(from), clockLabel(to)]
  const bare = style === "lane"
  const whole = style === "prose" && a.includes(":00 ") && b.includes(":00 ")
  const trim = (label: string) => (whole ? label.replace(":00", "") : label)
  const [timeA, halfA] = trim(a).split(" ")
  const [timeB, halfB] = trim(b).split(" ")
  if (bare) return `${timeA}–${timeB}`
  return halfA === halfB ? `${timeA}–${timeB} ${halfB}` : `${timeA} ${halfA}–${timeB} ${halfB}`
}

/** How long a stop with no end time probably takes. Booking type wins over the place's category. */
export function typicalMinutes(item: Pick<ItineraryItem, "kind" | "reservation" | "location">): number {
  const keys = [item.kind === "reservation" ? item.reservation?.type : undefined, item.location?.category]
  for (const key of keys) {
    const minutes = TYPICAL_MINUTES[key?.trim().toLowerCase() ?? ""]
    if (minutes) return minutes
  }
  return DEFAULT_STOP_MINUTES
}

/** The number each stop carries on the day map (`dayPins`), so the two always agree. */
export function stopNumbers(day: TripDay): Map<string, number> {
  const numbers = new Map<string, number>()
  for (const pin of dayPins(day)) if (pin.variant === "stop" && pin.label) numbers.set(pin.id, Number(pin.label))
  return numbers
}

// Stored documents can arrive without a title (geo.ts guards the same way).
export const stopTitle = (item: Pick<ItineraryItem, "title" | "location">) =>
  (item.title ?? "").trim() || item.location?.name?.trim() || "Untitled stop"

const isStop = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note"

/**
 * A flight or train booking is pinned where it leaves from, but it ends
 * somewhere else, so no leg is measured out of it (one into it, to the
 * airport or station, is real).
 */
const JOURNEYS = new Set(["flight", "transit", "train", "bus", "ferry"])
export const isJourney = (item: ItineraryItem) => item.kind === "reservation" && JOURNEYS.has(item.reservation?.type?.trim().toLowerCase() ?? "")

/**
 * The leg from one stop to the next: both pinned, more than a few steps
 * apart, and not out of a flight or train. The list view's leg rows should
 * use this too, so the two views never disagree.
 */
export function legEstimate(from: ItineraryItem, to: ItineraryItem): TravelEstimate | undefined {
  if (!isLocated(from) || !isLocated(to) || isJourney(from)) return undefined
  const meters = distanceMeters(from.location, to.location)
  return meters < MIN_LEG_METERS ? undefined : travelEstimate(meters)
}

interface Timed {
  item: ItineraryItem
  index: number
  start: number
  /** From `endTime`; null when there is none (or it equals the start). */
  knownEnd: number | null
  outcome: Outcome
}

interface Placed extends Timed {
  end: number
  estimated: boolean
}

/**
 * A guessed length never runs into the next timed stop: a plan written as
 * start times means you leave in time to get there. It is clipped to the next
 * start minus the trip over, but keeps a short stay (or all the time there is).
 */
function placeEnds(timed: readonly Timed[]): Placed[] {
  return timed.map((entry, i) => {
    if (entry.knownEnd !== null) return { ...entry, end: entry.knownEnd, estimated: false }
    let end = entry.start + typicalMinutes(entry.item)
    // A skipped stop is no reason to leave early.
    const next = timed.slice(i + 1).find((other) => other.start > entry.start && other.outcome !== "skipped")
    if (next) {
      const leave = next.start - (legEstimate(entry.item, next.item)?.minutes ?? 0)
      const floor = entry.start + Math.min(MIN_ESTIMATE, next.start - entry.start)
      end = Math.max(Math.min(end, leave), floor)
    }
    return { ...entry, end, estimated: true }
  })
}

/** Lowest free column per block; every block in an overlap cluster shares the cluster's column count. */
function assignLanes(placed: readonly Placed[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = []
  let cluster: TimelineBlock[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity
  const close = () => {
    for (const block of cluster) block.lanes = laneEnds.length
  }
  for (const entry of placed) {
    if (entry.start >= clusterEnd) {
      close()
      cluster = []
      laneEnds = []
    }
    let lane = laneEnds.findIndex((end) => end <= entry.start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = entry.end
    const block: TimelineBlock = {
      itemId: entry.item.id,
      start: entry.start,
      end: entry.end,
      lane,
      lanes: 1,
      estimated: entry.estimated,
      departs: entry.estimated && isJourney(entry.item),
      outcome: entry.outcome,
    }
    cluster.push(block)
    blocks.push(block)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  close()
  return blocks
}

function rulerWindow(placed: readonly Placed[]): { start: number; end: number } {
  if (placed.length === 0) return { start: EMPTY_START, end: EMPTY_START + EMPTY_WINDOW }
  const start = Math.floor(Math.min(...placed.map((p) => p.start)) / 60) * 60
  const end = Math.min(Math.ceil(Math.max(...placed.map((p) => p.end)) / 60) * 60, LATEST_END)
  // A short day runs on after its last stop: the rest of it is still to plan.
  return { start, end: Math.max(end, start + MIN_WINDOW) }
}

export function layoutDay(day: TripDay): DayLayout {
  const { planned, parked } = splitDay(day)
  const starts = planStarts(day)
  const timed: Timed[] = []
  const untimed: string[] = []
  planned.forEach((item, index) => {
    if (!isStop(item)) return
    const start = starts[index] ?? null
    if (start === null) {
      untimed.push(item.id)
      return
    }
    const end = dayEnd(start, item.endTime)
    timed.push({ item, index, start, knownEnd: end === start ? null : end, outcome: outcomeOf(item) })
  })
  // Parked places are on the day but not on its clock, even with a time.
  for (const item of parked) if (isStop(item)) untimed.push(item.id)

  timed.sort((x, y) => x.start - y.start || x.index - y.index)
  const placed = placeEnds(timed)
  const blocks = assignLanes(placed)

  // Skipped stops keep their place on the ruler (struck), but are not
  // happening: they clash with nothing and no leg runs into or out of them.
  const happening = placed.filter((entry) => entry.outcome !== "skipped")
  const gaps: TimelineGap[] = []
  const conflicts: TimelineConflict[] = []
  let busy = happening[0]
  for (let i = 1; i < happening.length; i++) {
    const stop = happening[i]!
    for (let j = 0; j < i; j++) {
      const earlier = happening[j]!
      if (stop.start < earlier.end) {
        conflicts.push({ ids: [earlier.item.id, stop.item.id], kind: "overlap", detail: `Overlaps ${stopTitle(earlier.item)}` })
      }
    }
    if (busy && stop.start >= busy.end) {
      const span = stop.start - busy.end
      const travel = legEstimate(busy.item, stop.item)
      gaps.push({
        from: busy.end,
        to: stop.start,
        afterId: busy.item.id,
        beforeId: stop.item.id,
        ...(travel ? { travel } : {}),
        free: Math.max(0, span - (travel?.minutes ?? 0)),
      })
      if (travel && travel.minutes > span) {
        conflicts.push({
          ids: [busy.item.id, stop.item.id],
          kind: "tight",
          detail: `Tight · ${travel.label}, ${span === 0 ? "no gap" : `${formatMinutes(span)} gap`}`,
        })
      }
    }
    if (!busy || stop.end > busy.end) busy = stop
  }

  return { ...rulerWindow(placed), blocks, gaps, untimed, conflicts }
}

// ── Scale ────────────────────────────────────────────────────────────────

/** A stretch of the day that needs at least `px` of height to stay legible. */
export interface ScaleSpan {
  from: number
  to: number
  px: number
}

export interface TimeScale {
  /** Breakpoints, ascending in time, with their pixel offsets. */
  stops: Array<{ t: number; y: number }>
  height: number
}

/**
 * Minutes → pixels, linear at `pxPerMin` except where a short stop or a
 * labelled gap needs more room: that stretch of the ruler grows (and the hour
 * rules with it) instead of blocks overlapping their neighbours. One forward
 * pass, since every span ends after it starts.
 */
export function timeScale(start: number, end: number, pxPerMin: number, spans: readonly ScaleSpan[]): TimeScale {
  const clamped = spans
    .map((span) => ({ from: Math.max(span.from, start), to: Math.min(span.to, end), px: span.px }))
    .filter((span) => span.to > span.from)
  const times = [...new Set([start, end, ...clamped.flatMap((span) => [span.from, span.to])])].sort((x, y) => x - y)
  const at = new Map<number, number>()
  const stops: TimeScale["stops"] = []
  for (const [i, t] of times.entries()) {
    const prev = stops[i - 1]
    let y = prev ? prev.y + (t - prev.t) * pxPerMin : 0
    for (const span of clamped) if (span.to === t) y = Math.max(y, (at.get(span.from) ?? 0) + span.px)
    at.set(t, y)
    stops.push({ t, y })
  }
  return { stops, height: stops[stops.length - 1]?.y ?? 0 }
}

/** Pixel offset of a minute on the scale; outside the window it clamps to the ends. */
export function yAt(scale: TimeScale, t: number): number {
  const { stops } = scale
  if (stops.length === 0) return 0
  if (t <= stops[0]!.t) return stops[0]!.y
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i]!
    if (t <= hi.t) {
      const lo = stops[i - 1]!
      return lo.y + ((t - lo.t) / (hi.t - lo.t)) * (hi.y - lo.y)
    }
  }
  return scale.height
}

/** Free time worth pointing out; anything less is just the walk between. */
export const FREE_LABEL_MIN = 15

/** When to set off for the next stop: its start less the journey. */
export const leaveAt = (gap: TimelineGap) => gap.to - (gap.travel?.minutes ?? 0)

/**
 * Free time still ahead in a gap, the journey taken out. `since` is the time
 * today on the day's clock (null on other days): a gap that has begun counts
 * from it, a past one not at all.
 */
export function freeAhead(gap: TimelineGap, since: number | null): number {
  if (since === null || since <= gap.from) return gap.free
  return Math.max(0, Math.min(gap.free, leaveAt(gap) - since))
}

/**
 * The words for the leg between two timed stops, the same in the list and on
 * the timeline: the free time ("1 h 08 free") and when to set off ("Leave by
 * 3:18 PM"), each only from FREE_LABEL_MIN, and only "Leave by" when there is
 * a journey.
 */
export function legWords(gap: TimelineGap, since: number | null): { free: string | null; leave: string | null } {
  const ahead = freeAhead(gap, since)
  if (ahead < FREE_LABEL_MIN) return { free: null, leave: null }
  return { free: `${formatMinutes(ahead)} free`, leave: gap.travel ? `Leave by ${clockLabel(leaveAt(gap))}` : null }
}

/**
 * On today, the run of stops already over, folded into one line so the day
 * opens on what is left ("4 stops done · 8:00 AM–1:30 PM"). The ruler starts
 * at `foldAt`: the hour of now, or of the stop under way if it began earlier.
 * Null when nothing is over, or the day is not today.
 */
export interface DoneFold {
  ids: string[]
  /** How many of `ids` were skipped rather than done. */
  skipped: number
  from: number
  to: number
  foldAt: number
}

/** Over at `since` (minutes on the day's clock; null off today): ended by then, marked done, or skipped. */
export const isOver = (block: Pick<TimelineBlock, "end" | "outcome">, since: number | null) =>
  block.outcome !== "planned" || (since !== null && block.end <= since)

export function doneFold(layout: DayLayout, since: number | null): DoneFold | null {
  if (since === null) return null
  const done = layout.blocks.filter((b) => isOver(b, since))
  if (done.length === 0) return null
  const live = layout.blocks.filter((b) => !isOver(b, since))
  // A day that is all behind you stays whole, quietly: there is nothing to open on.
  if (live.length === 0) return null
  const foldAt = Math.floor(Math.min(since, ...live.map((b) => b.start)) / 60) * 60
  // Only what ends by the fold line is folded; a stop that straddles it stays on the ruler.
  const folded = done.filter((b) => b.end <= foldAt)
  if (folded.length === 0) return null
  return {
    ids: folded.map((b) => b.itemId),
    skipped: folded.filter((b) => b.outcome === "skipped").length,
    from: Math.min(...folded.map((b) => b.start)),
    to: Math.max(...folded.map((b) => b.end)),
    foldAt,
  }
}
