import { TO_SCHEDULE } from "../map/geo"
import { dayCount, formatRange, formatTripDate, plural } from "../meta"
import type { ItineraryItem, Trip } from "../types"
import { dayCity, planDay, stopFacts, type DayPlan } from "./printModel"

// A trip as text to paste into a message: plain for chat apps, Markdown for
// notes apps. Pure, so the same trip always gives the same text.
//
// Times stay 24-hour "HH:MM" here: fixed width, so they line up in a column
// and read the same in every locale.

export interface ItineraryTextOptions {
  format: "plain" | "markdown"
  /** Trip description, day notes and stop notes. Off by default: messages stay short. */
  includeNotes?: boolean
}

/** "10:40", "10:40–12:00", or null. */
function timeLabel(item: ItineraryItem): string | null {
  const start = item.time?.trim()
  if (!start) return null
  const end = item.endTime?.trim()
  return end ? `${start}–${end}` : start
}

/**
 * "UA 893 · SFO → ICN · Booked · Conf ABC123". `text` escapes what the
 * traveller wrote; `code` sets the confirmation.
 */
function stopLine(item: ItineraryItem, text = (s: string) => s, code = (s: string) => s): string {
  const facts = stopFacts(item)
  return [
    ...[facts.title, facts.place, facts.status].filter((part): part is string => Boolean(part)).map(text),
    ...(facts.confirmation ? [`Conf ${code(facts.confirmation)}`] : []),
  ].join(" · ")
}

/** The lines under a stop: its address, then (when asked) its notes. */
function detailLines(item: ItineraryItem, includeNotes: boolean): string[] {
  const facts = stopFacts(item)
  const lines = facts.address ? [facts.address] : []
  if (includeNotes && facts.notes) lines.push(...splitLines(facts.notes))
  return lines
}

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

function dayHeader(trip: Trip, index: number): string {
  const day = trip.days[index]!
  const city = dayCity(trip, day)
  const title = day.title?.trim()
  return [formatTripDate(day.date, trip.timezone), `Day ${index + 1}`, city].filter(Boolean).join(" · ") + (title ? ` — ${title}` : "")
}

const NOTHING_PLANNED = "Nothing planned yet"

// ── Plain ────────────────────────────────────────────────────────────────

const plainTime = (item: ItineraryItem) => timeLabel(item) ?? "-"

/**
 * Stops with their time in a padded column ("-" when untimed), and the
 * address and notes indented under the title, so a block reads as one stop.
 */
function plainStops(items: readonly ItineraryItem[], width: number, includeNotes: boolean): string[] {
  const indent = " ".repeat(width + 2)
  return items.flatMap((item) => [
    `${plainTime(item).padEnd(width)}  ${stopLine(item)}`,
    ...detailLines(item, includeNotes).map((line) => indent + line),
  ])
}

function plainDay(trip: Trip, index: number, plan: DayPlan, includeNotes: boolean): string[] {
  const day = trip.days[index]!
  const out = [dayHeader(trip, index)]
  if (includeNotes && day.notes?.trim()) out.push(...splitLines(day.notes))
  if (plan.empty) return [...out, NOTHING_PLANNED]
  // One time column for the whole day, headings and "To schedule" included.
  const stops = [...plan.rows.flatMap((row) => (row.k === "stop" ? [row.item] : [])), ...plan.parked]
  const width = Math.max(...stops.map((item) => plainTime(item).length))
  // A heading closes one run of stops and opens the next.
  let run: ItineraryItem[] = []
  const flush = () => {
    if (run.length > 0) out.push(...plainStops(run, width, includeNotes))
    run = []
  }
  for (const row of plan.rows) {
    if (row.k === "stop") {
      run.push(row.item)
      continue
    }
    flush()
    out.push("", row.time ? `${row.title} · ${row.time}` : row.title)
  }
  flush()
  if (plan.parked.length > 0) out.push("", TO_SCHEDULE, ...plainStops(plan.parked, width, includeNotes))
  return out
}

// ── Markdown ─────────────────────────────────────────────────────────────

/** Escape what would turn a traveller's text into formatting. */
function md(text: string): string {
  return text.replace(/[\\`*_[\]<>~]/g, "\\$&")
}

/**
 * Keep escaped text from opening a heading, quote or list at the start of a
 * line: "# x", "- x", "+ x" escape the marker, "1. x" the dot ("1\. x").
 */
const blockSafe = (escaped: string) => escaped.replace(/^[#>+-]/, "\\$&").replace(/^(\d+)([.)])/, "$1\\$2")

/** A line of the traveller's text that must stay a line of text. */
const mdLine = (text: string) => blockSafe(md(text))

/** Confirmation codes read as code: `ABC123`. */
const mdCode = (code: string) => (code.includes("`") ? md(code) : `\`${code}\``)

/** Two trailing spaces: a line break inside the item, invisible in plain view. */
const BREAK = "  "

function mdStops(items: readonly ItineraryItem[], includeNotes: boolean): string[] {
  return items.map((item) => {
    const time = timeLabel(item)
    const line = stopLine(item, md, mdCode)
    // Without a time the title opens the list item, where "1. x" would nest a list.
    const head = time ? `- **${md(time)}** ${line}` : `- ${blockSafe(line)}`
    const details = detailLines(item, includeNotes).map((line) => `  ${mdLine(line)}`)
    return [head, ...details].join(`${BREAK}\n`)
  })
}

function markdownDay(trip: Trip, index: number, plan: DayPlan, includeNotes: boolean): string[] {
  const day = trip.days[index]!
  const out = [`## ${md(dayHeader(trip, index))}`]
  if (includeNotes && day.notes?.trim()) out.push("", splitLines(day.notes).map(mdLine).join(`${BREAK}\n`))
  if (plan.empty) return [...out, "", `_${NOTHING_PLANNED}_`]
  let run: ItineraryItem[] = []
  const flush = () => {
    if (run.length > 0) out.push("", ...mdStops(run, includeNotes))
    run = []
  }
  for (const row of plan.rows) {
    if (row.k === "stop") {
      run.push(row.item)
      continue
    }
    flush()
    out.push("", `### ${md(row.time ? `${row.title} · ${row.time}` : row.title)}`)
  }
  flush()
  if (plan.parked.length > 0) out.push("", `### ${TO_SCHEDULE}`, "", ...mdStops(plan.parked, includeNotes))
  return out
}

// ── Entry ────────────────────────────────────────────────────────────────

export function itineraryText(trip: Trip, options: ItineraryTextOptions): string {
  const includeNotes = options.includeNotes ?? false
  const markdown = options.format === "markdown"
  const name = trip.name.trim() || "Untitled trip"
  const dates = `${formatRange(trip.startDate, trip.endDate)} · ${plural(dayCount(trip.startDate, trip.endDate), "day")}`
  const places = trip.destinations.map((d) => d.trim()).filter(Boolean).join(", ")
  const description = includeNotes ? trip.description?.trim() : undefined

  const out: string[] = []
  if (markdown) {
    out.push(`# ${md(name)}`, "", places ? `${md(dates)}${BREAK}\n${md(places)}` : md(dates))
    if (description) out.push("", splitLines(description).map(mdLine).join(`${BREAK}\n`))
  } else {
    out.push(name, dates)
    if (places) out.push(places)
    if (description) out.push(...splitLines(description))
  }
  trip.days.forEach((day, index) => {
    const plan = planDay(day)
    out.push("", ...(markdown ? markdownDay(trip, index, plan, includeNotes) : plainDay(trip, index, plan, includeNotes)))
  })
  return out.join("\n")
}
