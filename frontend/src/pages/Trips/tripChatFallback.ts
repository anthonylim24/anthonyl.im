import type { Trip, TripDay } from "./types"

const MAX_TITLE = 80
const MAX_NOTE = 240
const MAX_ITEMS = 8

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

/** `/api/korea/chat` rejects prompts longer than this. */
export const KOREA_CHAT_PROMPT_MAX = 2000

function dayLine(day: TripDay, index: number): string {
  const titles = day.items
    .filter((i) => i.kind !== "section")
    .slice(0, MAX_ITEMS)
    .map((i) => clip(i.title, 40) || "(untitled)")
  const more = day.items.filter((i) => i.kind !== "section").length - titles.length
  const stops = titles.length
    ? ` · ${titles.join("; ")}${more > 0 ? `; +${more} more` : ""}`
    : " · no stops yet"
  return `  Day ${index + 1} · ${day.date}${day.city ? ` · ${day.city}` : ""}${day.title ? ` · ${day.title}` : ""}${stops}`
}

function focusedDay(day: TripDay, index: number): string {
  const lines = [`FOCUSED DAY: Day ${index + 1} · ${day.date}${day.city ? ` · ${day.city}` : ""}${day.title ? ` · ${day.title}` : ""}`]
  if (day.neighborhoods?.length) lines.push(`  Neighborhoods: ${day.neighborhoods.join(", ")}`)
  for (const item of day.items) {
    const extra = [item.time, item.location?.address, item.notes ? clip(item.notes, MAX_NOTE) : ""]
      .filter(Boolean)
      .join("; ")
    lines.push(`  - [${item.kind}] ${clip(item.title, MAX_TITLE) || "(untitled)"}${extra ? ` (${extra})` : ""}`)
  }
  return lines.join("\n")
}

/** Prompt wrapper so `/api/korea/chat` can answer for a non-Korea trip when
 *  `POST /api/trips/:id/chat` is not on the server yet (PR preview). */
export function wrapTripChatPrompt(trip: Trip, prompt: string, dayId?: string): string {
  const question = `Question: ${clip(prompt, 400)}`
  const header = [
    "Ignore the Korea itinerary in your instructions. That is a different trip. Answer ONLY from the itinerary below.",
    `TRIP: ${trip.name}`,
    `Dates: ${trip.startDate} to ${trip.endDate}`,
    `Time zone: ${trip.timezone}`,
    `Destinations: ${trip.destinations.join(", ") || "(none)"}`,
  ].join("\n")

  const focusedIndex = dayId ? trip.days.findIndex((d) => d.id === dayId) : -1
  const focused = focusedIndex >= 0 ? focusedDay(trip.days[focusedIndex]!, focusedIndex) : ""
  let days = trip.days.length
    ? `ALL DAYS:\n${trip.days.map((d, i) => dayLine(d, i)).join("\n")}`
    : "ALL DAYS: (none yet)"

  const assemble = (daysBlock: string, focusBlock: string) =>
    [header, daysBlock, focusBlock, question].filter(Boolean).join("\n\n")

  let assembled = assemble(days, focused)
  if (assembled.length <= KOREA_CHAT_PROMPT_MAX) return assembled

  days = trip.days.length ? `ALL DAYS: ${trip.days.length} days (truncated)` : days
  assembled = assemble(days, focused)
  if (assembled.length <= KOREA_CHAT_PROMPT_MAX) return assembled

  const room = KOREA_CHAT_PROMPT_MAX - assemble("", "").length - 1
  const clippedFocus = room > 24 ? clip(focused, room) : ""
  assembled = assemble("", clippedFocus)
  if (assembled.length <= KOREA_CHAT_PROMPT_MAX) return assembled
  return clip(assembled, KOREA_CHAT_PROMPT_MAX)
}

export function isKoreaSeedTrip(trip: Trip): boolean {
  return trip.id === "korea-2026" || trip.slug === "korea-2026"
}
