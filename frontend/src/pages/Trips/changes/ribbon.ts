import { clockLabel, layoutDay } from "../timeline/timeline"
import type { TripDay } from "../types"
import type { DayDiff, StopChange } from "./planDiff"

// The day ribbon in the changes sheet: one hour ruler for a day, each timed
// stop a block placed by minute, as it was before an apply and as it is
// after. Blocks are placed by the timeline's own layout (`layoutDay`), so
// the ribbon's lengths and lanes agree with the day's timeline.

/** The ribbon always shows at least this much of the day. */
const FLOOR_START = 8 * 60
const FLOOR_END = 20 * 60
/** Overlaps beyond the third lane share it: the rows below carry the detail. */
const MAX_LANES = 3

export interface Slot {
  start: number
  end: number
  lane: number
}

/**
 * How a block gets from its before slot to its after one:
 * - `still`: nothing to show (or a lane or length nudged by a neighbour).
 * - `travel`: a new clock; it springs along the ruler and leaves a ghost.
 * - `enter`: added; drops in from above.
 * - `rise`: arrived from another day (or gained a time); rises in.
 * - `remove`: taken off; shrinks to a struck ghost.
 * - `leave`: went to another day (or lost its time); slides down, leaving a ghost with `note`.
 */
export type BlockMotion = "still" | "travel" | "enter" | "rise" | "remove" | "leave"

export interface RibbonBlock {
  id: string
  from: Slot | null
  to: Slot | null
  motion: BlockMotion
  /** `marked`: the apply touched it (brand). `added`: it is new (brand fill). */
  tone: "plain" | "marked" | "added"
  /** Under the ghost a leaving block leaves: "→ Day 4", "Anytime". */
  note: string | null
}

export interface Ribbon {
  /** The ruler, in minutes on the day's clock, on whole hours. */
  start: number
  end: number
  lanes: number
  blocks: RibbonBlock[]
  /** Every whole hour from `start` to `end`. */
  hours: number[]
}

function slots(day: TripDay | undefined): Map<string, Slot> {
  const placed = new Map<string, Slot>()
  if (!day) return placed
  for (const block of layoutDay(day).blocks) {
    placed.set(block.itemId, { start: block.start, end: block.end, lane: Math.min(block.lane, MAX_LANES - 1) })
  }
  return placed
}

const sameSlot = (a: Slot, b: Slot) => a.start === b.start && a.end === b.end && a.lane === b.lane

function motionFor(change: StopChange | undefined, from: Slot | null, to: Slot | null, swapped: boolean): Pick<RibbonBlock, "motion" | "tone"> {
  if (!from) {
    if (change?.kind === "added") return { motion: "enter", tone: "added" }
    return { motion: "rise", tone: change || swapped ? "marked" : "plain" }
  }
  if (!to) return { motion: change?.kind === "removed" ? "remove" : "leave", tone: "plain" }
  const touched = change !== undefined
  return { motion: sameSlot(from, to) ? "still" : "travel", tone: touched ? "marked" : "plain" }
}

/** `dayName`: "Day 4" for a day id, for the note a stop leaves when it moves. */
export function dayRibbon(before: TripDay | undefined, after: TripDay | undefined, diff: DayDiff, dayName: (dayId: string) => string): Ribbon {
  const was = slots(before)
  const now = slots(after)
  const changeOf = new Map<string, StopChange>()
  for (const change of diff.changes) changeOf.set(change.item.id, change)
  const swapped = diff.swappedWith !== null
  // Put back in time order: the stop that was listed too low is the one the apply moved.
  const putInOrder = diff.reordered?.kind === "clock" ? diff.reordered.earlier.id : null

  const blocks: RibbonBlock[] = []
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const from = was.get(id) ?? null
    const to = now.get(id) ?? null
    const change = changeOf.get(id)
    const note = change?.kind === "movedOut" ? `→ ${dayName(change.toDayId)}` : change?.kind === "retimed" && !to ? "Anytime" : null
    const motion = motionFor(change, from, to, swapped)
    blocks.push({ id, from, to, note, ...motion, ...(id === putInOrder && motion.tone === "plain" ? { tone: "marked" as const } : {}) })
  }

  const spans = blocks.flatMap((block) => [block.from, block.to]).filter((slot): slot is Slot => slot !== null)
  const start = Math.min(FLOOR_START, ...spans.map((slot) => Math.floor(slot.start / 60) * 60))
  const end = Math.max(FLOOR_END, ...spans.map((slot) => Math.ceil(slot.end / 60) * 60))
  const lanes = Math.max(1, ...spans.map((slot) => slot.lane + 1))
  const hours: number[] = []
  for (let at = start; at <= end; at += 60) hours.push(at)
  return { start, end, lanes, blocks, hours }
}

/** "9 AM", for the ruler's labels. */
export const hourLabel = (minutes: number) => clockLabel(minutes).replace(":00", "")
