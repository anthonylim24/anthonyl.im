import { dayPins, distanceMeters, isLocated, splitDay } from "../map/geo"
import { formatClock } from "../meta"
import type { ItineraryItem, TripDay } from "../types"
import { formatMinutes, MIN_LEG_METERS, travelEstimate, type TravelEstimate } from "./travel"

// Pure layout for the day timeline: which stops sit on the clock, how long
// each one probably takes, where they collide, and what lies between them.
// All times are minutes from the day's midnight; past midnight runs on
// (01:30 the next morning is 1530).

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
  /** "Overlaps Gyeongbokgung", "Tight · ≈ 35 min by transit, 15 min gap". */
  detail: string
}

export interface DayLayout {
  /** The ruler's window, on whole hours, at least six hours long. */
  start: number
  end: number
  blocks: TimelineBlock[]
  gaps: TimelineGap[]
  /** Stops with no usable time, then everything under "To schedule", in itinerary order. */
  untimed: string[]
  conflicts: TimelineConflict[]
}

const DAY = 24 * 60
const MIN_WINDOW = 6 * 60
/** The ruler stops at 06:00 the next morning; a stay that runs on is drawn to the edge. */
const LATEST_END = DAY + 6 * 60
/** A stop with a guessed length keeps at least this long before it gives way to the next. */
const MIN_ESTIMATE = 15
/** The window used when nothing is on the clock (only the empty state reads it). */
const EMPTY_START = 9 * 60

/** Typical minutes at a stop, by booking type or place category. */
const TYPICAL_MINUTES: Record<string, number> = {
  flight: 180,
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

/** "HH:MM" → minutes from midnight, or null when it isn't a real clock time. */
export function clockMinutes(time?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() ?? "")
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Minutes from midnight → "9:30 AM". Past midnight wraps (1530 → "1:30 AM"). */
export function clockLabel(minutes: number): string {
  const wrapped = ((Math.round(minutes) % DAY) + DAY) % DAY
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0")
  const mm = String(wrapped % 60).padStart(2, "0")
  return formatClock(`${hh}:${mm}`)
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
const JOURNEYS = new Set(["flight", "transit"])
const isJourney = (item: ItineraryItem) => item.kind === "reservation" && JOURNEYS.has(item.reservation?.type?.trim().toLowerCase() ?? "")

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
    const next = timed.slice(i + 1).find((other) => other.start > entry.start)
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
    const block: TimelineBlock = { itemId: entry.item.id, start: entry.start, end: entry.end, lane, lanes: 1, estimated: entry.estimated }
    cluster.push(block)
    blocks.push(block)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  close()
  return blocks
}

function rulerWindow(placed: readonly Placed[]): { start: number; end: number } {
  if (placed.length === 0) return { start: EMPTY_START, end: EMPTY_START + MIN_WINDOW }
  let start = Math.floor(Math.min(...placed.map((p) => p.start)) / 60) * 60
  let end = Math.min(Math.ceil(Math.max(...placed.map((p) => p.end)) / 60) * 60, LATEST_END)
  if (end - start < MIN_WINDOW) {
    // Pad both sides (no earlier than midnight) so a short day sits mid-ruler.
    const pad = MIN_WINDOW - (end - start)
    start -= Math.min(start, Math.ceil(pad / 2 / 60) * 60)
    end = start + MIN_WINDOW
  }
  return { start, end }
}

export function layoutDay(day: TripDay): DayLayout {
  const { planned, parked } = splitDay(day)
  const timed: Timed[] = []
  const untimed: string[] = []
  planned.forEach((item, index) => {
    if (!isStop(item)) return
    const start = clockMinutes(item.time)
    if (start === null) {
      untimed.push(item.id)
      return
    }
    const end = clockMinutes(item.endTime)
    const knownEnd = end === null || end === start ? null : end > start ? end : end + DAY
    timed.push({ item, index, start, knownEnd })
  })
  // Parked places are on the day but not on its clock, even with a time.
  for (const item of parked) if (isStop(item)) untimed.push(item.id)

  timed.sort((x, y) => x.start - y.start || x.index - y.index)
  const placed = placeEnds(timed)
  const blocks = assignLanes(placed)

  const gaps: TimelineGap[] = []
  const conflicts: TimelineConflict[] = []
  let busy = placed[0]
  for (let i = 1; i < placed.length; i++) {
    const stop = placed[i]!
    for (let j = 0; j < i; j++) {
      const earlier = placed[j]!
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
