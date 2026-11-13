import { streamSSE } from "hono/streaming"
import type { Context } from "hono"
import {
  createAddPlacesFenceFilter,
  dropPlacesAlreadyOnTrip,
  enrichPlacesWithGeocode,
  mergeConciergePlaces,
  parseAddPlacesTrailer,
  parseTripMovesTrailer,
  placeCanBeAdded,
  placesFromMapsChunks,
  sourcesFromGrounding,
  tripPlaceTitles,
  type PlaceGeocoder,
} from "../geminiGrounding"
import { relayGeminiChatBody } from "../geminiStream"
import { fetchGeminiStreamWithToolFallback, mapsRetrievalConfig } from "../geminiTools"
import { geminiThinking } from "../igPlaces/gemini"
import { withSsePings } from "../ssePing"
import type { ItineraryItem, Trip, TripDay } from "./types"
import { analyseDay, describeSignals, weekday } from "./signals"
import { tripLatLngHint } from "./latLngHint"

export { tripLatLngHint }

const MAX_NOTE = 400
const MAX_TITLE = 80
const MAX_ITEMS_PER_OVERVIEW_DAY = 8

export interface TripChatTurn {
  role: "user" | "assistant"
  content: string
}

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function fmtItem(item: ItineraryItem): string {
  const title = clip(item.title, MAX_TITLE) || "(untitled)"
  const bits = [item.time ? item.time : null, `[${item.kind}]`, title].filter(Boolean)
  const extra: string[] = []
  if (item.location?.name && item.location.name !== item.title) extra.push(`@ ${item.location.name}`)
  if (item.location?.address) extra.push(item.location.address)
  if (item.location?.category) extra.push(item.location.category)
  if (item.reservation) {
    extra.push(`${item.reservation.type}${item.reservation.status ? ` ${item.reservation.status}` : ""}`)
    if (item.reservation.confirmation) extra.push(`conf ${item.reservation.confirmation}`)
  }
  if (item.status && item.status !== "none") extra.push(`status ${item.status}`)
  if (item.notes) extra.push(clip(item.notes, MAX_NOTE))
  return `    - ${bits.join(" ")}${extra.length ? ` (${extra.join("; ")})` : ""}`
}

function dayLabel(day: TripDay, index: number): string {
  const n = index + 1
  return (
    `Day ${n} · ${weekday(day.date)} ${day.date} · dayId=${day.id}` +
    (day.city ? ` · ${day.city}` : "") +
    (day.title ? ` — ${day.title}` : "")
  )
}

function fmtDayOverview(day: TripDay, index: number): string {
  const booked = day.items.filter((i) => i.kind === "reservation" || i.status === "booked").length
  const titles = day.items
    .filter((i) => i.kind !== "section")
    .slice(0, MAX_ITEMS_PER_OVERVIEW_DAY)
    .map((i) => `${i.time ? `${i.time} ` : ""}${clip(i.title, 40) || "(untitled)"}`)
  const more = day.items.filter((i) => i.kind !== "section").length - titles.length
  const tail = titles.length
    ? ` — ${titles.join("; ")}${more > 0 ? `; +${more} more` : ""}`
    : " — no stops yet"
  return `  ${dayLabel(day, index)} (${booked} booked)${tail}`
}

function fmtDayDetail(day: TripDay, index: number): string {
  const lines: string[] = [dayLabel(day, index)]
  if (day.neighborhoods?.length) lines.push(`  Neighborhoods: ${day.neighborhoods.join(", ")}`)
  if (day.weather) {
    lines.push(`  Weather: ${day.weather.condition}, ${day.weather.lowC}–${day.weather.highC}°C`)
  }
  if (day.notes) lines.push(`  Theme: ${clip(day.notes, MAX_NOTE)}`)
  if (day.callouts?.length) {
    for (const c of day.callouts) lines.push(`  [${c.tone}] ${clip(c.body, MAX_NOTE)}`)
  }
  if (day.items.length === 0) {
    lines.push("  (no items yet)")
    return lines.join("\n")
  }
  lines.push("  Items:")
  for (const item of day.items) lines.push(fmtItem(item))
  lines.push(`  Computed facts:\n${describeSignals(analyseDay(day))}`)
  return lines.join("\n")
}

/** Where "now" falls against the trip, in the trip's own time zone. */
export function tripPhase(
  trip: Trip,
  now: Date = new Date(),
): { today: string; clock: string; phase: "before" | "during" | "after"; line: string; todayId?: string } {
  let today = now.toISOString().slice(0, 10)
  let clock = now.toISOString().slice(11, 16)
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: trip.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
    today = `${get("year")}-${get("month")}-${get("day")}`
    clock = `${get("hour")}:${get("minute")}`
  } catch {
    // Unknown time zone id: fall back to UTC.
  }
  const days = (from: string, to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
  if (today < trip.startDate) {
    const n = days(today, trip.startDate)
    return { today, clock, phase: "before", line: `The trip has not started: it begins in ${n} day${n === 1 ? "" : "s"}. The traveller is planning.` }
  }
  if (today > trip.endDate) {
    return { today, clock, phase: "after", line: "The trip is over. The traveller is looking back, or reusing the plan." }
  }
  const index = trip.days.findIndex((d) => d.date === today)
  const day = index >= 0 ? trip.days[index] : undefined
  return {
    today,
    clock,
    phase: "during",
    todayId: day?.id,
    line: day
      ? `The trip is under way: today is Day ${index + 1} of ${trip.days.length} (dayId=${day.id}). The traveller is probably there now, on a phone.`
      : "The trip is under way.",
  }
}

/** Budget for full-detail days (chars). Past it, far-off days collapse to a line. */
const DETAIL_BUDGET = 28_000

/** Itinerary digest for the concierge. Every day is given in full while the
 *  trip fits the budget, so cross-day questions ("which day is the palace?",
 *  "do we have a free evening?") are answered from data. On very long trips
 *  the days nearest the one in view keep their detail and the rest collapse
 *  to a line each. */
export function buildTripChatContext(trip: Trip, dayId?: string, now: Date = new Date()): string {
  const focusedIndex = dayId ? trip.days.findIndex((d) => d.id === dayId) : -1
  const focused = focusedIndex >= 0 ? trip.days[focusedIndex] : undefined
  const phase = tripPhase(trip, now)
  const todayIndex = phase.todayId ? trip.days.findIndex((d) => d.id === phase.todayId) : -1
  const anchor = focusedIndex >= 0 ? focusedIndex : todayIndex >= 0 ? todayIndex : 0

  const sections: string[] = []
  sections.push(
    `TRIP: ${trip.name}\n` +
      `Dates: ${trip.startDate} → ${trip.endDate}\n` +
      `Time zone: ${trip.timezone}\n` +
      `Destinations: ${trip.destinations.join(", ") || "(none)"}\n` +
      `Status: ${trip.status}` +
      (trip.description ? `\nDescription: ${clip(trip.description, 600)}` : "") +
      (trip.appearance?.headline ? `\nHeadline: ${clip(trip.appearance.headline, 400)}` : ""),
  )

  if (trip.days.length === 0) {
    sections.push("ALL DAYS: (none yet)")
    return sections.join("\n\n")
  }

  sections.push(`ALL DAYS (overview):\n${trip.days.map((d, i) => fmtDayOverview(d, i)).join("\n")}`)

  // Spend the budget outward from the day in view.
  const order = trip.days
    .map((_, i) => i)
    .sort((x, y) => Math.abs(x - anchor) - Math.abs(y - anchor) || x - y)
  const detail = new Map<number, string>()
  let spent = 0
  for (const i of order) {
    const day = trip.days[i]!
    if (i !== anchor && day.items.length === 0) continue
    const text = fmtDayDetail(day, i)
    if (i !== anchor && spent + text.length > DETAIL_BUDGET) continue
    detail.set(i, text)
    spent += text.length
  }

  if (focused) {
    sections.push(`FOCUSED DAY (the traveller is looking at this day right now):\n${detail.get(focusedIndex)!}`)
  }
  const rest = [...detail.entries()].filter(([i]) => i !== focusedIndex).sort(([x], [y]) => x - y)
  if (rest.length) {
    sections.push(`${focused ? "OTHER DAYS" : "DAYS"} (full detail):\n${rest.map(([, text]) => text).join("\n\n")}`)
  }

  return sections.join("\n\n")
}

export function buildTripChatSystemInstruction(trip: Trip, dayId?: string, now: Date = new Date()): string {
  const phase = tripPhase(trip, now)
  const dest = trip.destinations.join(" + ") || "this trip"
  const exampleDay = dayId ?? phase.todayId ?? trip.days[0]?.id ?? ""

  return [
    `You are the concierge for one private trip: ${trip.name} (${dest}, ${trip.startDate} to ${trip.endDate}). You know the destination like a long-time resident and you have the traveller's full itinerary below. You are talking to the traveller, usually on a phone, often mid-walk.`,
    ``,
    `NOW`,
    `- Local time at the destination (${trip.timezone}): ${weekday(phase.today)} ${phase.today}, ${phase.clock}.`,
    `- ${phase.line}`,
    `- Read "today", "tonight", "tomorrow", "now" and "nearby" against that clock${dayId ? " and the focused day" : ""}. During the trip, weigh what is open right now and how far it is from where the plan puts them at this hour.`,
    ``,
    `HOW TO ANSWER`,
    `- Lead with the answer. The first line is the recommendation, the time, or the fact they asked for; reasons come after, briefly.`,
    `- Decide for them. Give one pick and say why it wins; add at most two alternatives when the choice really depends on taste, each with the reason someone would prefer it. Never a list of ten.`,
    `- Be specific and practical: what to order, which exit or entrance, how long the walk or ride is, when the queue is shortest, whether to book. Say how a suggestion fits the plan ("ten minutes from the museum you finish at 15:00").`,
    `- Short. Two to five lines for a simple question; brief bullets for options or steps; bold only the name of the place or the one thing they must not miss. Markdown only: no headings, no tables, no preamble, no sign-off, no "Great question".`,
    `- Match their language. Give place names in the local script as well when it helps them show a driver or read a sign.`,
    `- If the question is ambiguous, answer the most likely reading and name the assumption in a few words. Ask a question only when a wrong guess would waste their time.`,
    ``,
    `WHAT YOU KNOW AND WHAT YOU CHECK`,
    `- Bookings, times, confirmation numbers and what is planned for which day come ONLY from the itinerary data below. Never invent or guess them. If it is not in the data, say so plainly.`,
    `- Opening hours, closures, prices, queues, events, transit, weather and anything else that changes: check with Google Search and Google Maps before you state it, and say in a word where it came from ("per Google Maps", "the venue's site says"). Without those tools, say you could not check live and tell them what to verify.`,
    `- Every venue you recommend must be real and operating. Verify it on Maps; if you cannot, do not recommend it.`,
    `- For anything booked, lead with the time and status, and flag items that are pending, tentative or needs_review.`,
    `- "Computed facts" under a day are measured from the itinerary (missing meals, long gaps, long hops). Use them when asked how a day looks or what to add. Do not recite them unasked.`,
    `- Health, safety, visas, money and the law: give the practical answer and point to the official source. Do not guess.`,
    ``,
    `CHANGING THE PLAN`,
    `You cannot edit the itinerary yourself. You propose changes in machine-readable blocks that the app turns into buttons, and the traveller confirms. Put blocks AFTER your reply, never inside a sentence, and never mention the blocks or their syntax.`,
    `1. New places. Whenever you recommend venues that are NOT already on the itinerary, append:`,
    `:::add-places`,
    `[{"name":"Venue","address":"street address","lat":0,"lng":0,"category":"restaurant","dayId":"${exampleDay}","notes":"one-line why","placeId":"","mapsUrl":""}]`,
    `:::`,
    `Use the exact name and address from Maps, with real lat/lng when Maps has them (omit them rather than guess). "category" is one of restaurant, cafe, bar, market, shopping, museum, palace, shrine, park, viewpoint, experience, landmark, neighborhood, hotel, transit, venue. "dayId" is the day it best fits (a dayId from the data); omit it if it has no obvious day. "notes" is the single most useful thing to know. List only places you named in the reply, best first, at most five. No block for logistics-only answers or for places already on the itinerary.`,
    `2. Changes to stops already planned. Only when the traveller asks to remove, move or re-time something, append:`,
    `:::trip-moves`,
    `[{"type":"remove","name":"Exact title","dayId":""},{"type":"move","name":"Exact title","fromDayId":"","toDayId":""},{"type":"set_time","name":"Exact title","dayId":"","time":"13:00"}]`,
    `:::`,
    `Use the stop's exact title and dayIds from the data, and 24h times. In the reply, say what you are proposing in one line so the buttons make sense.`,
    ``,
    `=== ITINERARY DATA ===`,
    buildTripChatContext(trip, dayId, now),
  ].join("\n")
}


/** Relay Gemini SSE into the frontend's `data: <json-string>` + `[DONE]` shape. */
export async function streamTripChat(
  c: Context,
  args: {
    trip: Trip
    prompt: string
    dayId?: string
    messages: TripChatTurn[]
    geocode?: PlaceGeocoder | null
  },
): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return c.json(
      { error: "gemini_not_configured", message: "GEMINI_API_KEY is not set on the server." },
      503,
    )
  }

  const systemInstruction = buildTripChatSystemInstruction(args.trip, args.dayId)
  const history = args.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [...history, { role: "user", parts: [{ text: args.prompt }] }],
    generationConfig: {
      temperature: 0.45,
      // Room for a full answer plus the add-places / trip-moves trailers.
      maxOutputTokens: 4096,
      // `minimal` is rejected (400). `low` is the snappy chat tier.
      thinkingConfig: geminiThinking("low"),
    },
  }

  // Search + Maps grounding can sit quiet for a while before the first token.
  const upstreamSignal = AbortSignal.any([AbortSignal.timeout(120_000), c.req.raw.signal])
  const toolConfig = mapsRetrievalConfig(tripLatLngHint(args.trip, args.dayId))

  c.header("Cache-Control", "no-cache")
  c.header("X-Accel-Buffering", "no")

  return streamSSE(c, async (stream) => {
    let sawText = false
    let finishReason: string | undefined
    let blockReason: string | undefined

    try {
      // Keep pings going through header wait AND body consumption — a long
      // quiet read can otherwise idle-timeout the reverse proxy.
      await withSsePings(
        () => stream.writeSSE({ event: "ping", data: "" }),
        (async () => {
          const res = await fetchGeminiStreamWithToolFallback({
            apiKey,
            baseBody: body,
            toolConfig,
            signal: upstreamSignal,
            logLabel: "trips-chat",
          })

          if (!res.ok || !res.body) {
            const detail = await res.text().catch(() => "")
            console.error(`[trips-chat] gemini ${res.status}: ${detail.slice(0, 300)}`)
            await stream.writeSSE({
              data: JSON.stringify({ error: "The assistant is unavailable right now. Please try again." }),
            })
            await stream.writeSSE({ data: "[DONE]" })
            return
          }

          const fence = createAddPlacesFenceFilter()
          const relayed = await relayGeminiChatBody(res.body, async (delta) => {
            const visible = fence.push(delta)
            if (visible) {
              sawText = true
              await stream.writeSSE({ data: JSON.stringify(visible) })
            }
          })
          const { visibleTail, hidden } = fence.end()
          if (visibleTail) {
            sawText = true
            await stream.writeSSE({ data: JSON.stringify(visibleTail) })
          }
          finishReason = relayed.finishReason
          blockReason = relayed.blockReason

          let places = dropPlacesAlreadyOnTrip(
            mergeConciergePlaces(parseAddPlacesTrailer(hidden), placesFromMapsChunks(relayed.grounding)),
            tripPlaceTitles(args.trip.days),
          )
          if (places.length && args.geocode) {
            places = await enrichPlacesWithGeocode(places, args.geocode)
          }
          places = places.filter((p) => placeCanBeAdded(p) || Boolean(p.mapsUrl))
          const sources = sourcesFromGrounding(relayed.grounding)

          if (sawText && finishReason === "MAX_TOKENS") {
            await stream.writeSSE({ data: JSON.stringify("\n\n*…trimmed for length. Ask me to continue.*") })
          }

          if (!sawText && places.length === 0) {
            const reason = blockReason
              ? "That one's outside what I can help with for this trip."
              : "I couldn't find an answer for that. Try rephrasing, or ask about a specific day, restaurant, or reservation."
            await stream.writeSSE({ data: JSON.stringify(reason) })
          }

          const moves = parseTripMovesTrailer(hidden)

          if (places.length) await stream.writeSSE({ data: JSON.stringify({ places }) })
          if (moves.length) await stream.writeSSE({ data: JSON.stringify({ moves }) })
          if (sources.length) await stream.writeSSE({ data: JSON.stringify({ sources }) })

          await stream.writeSSE({ data: "[DONE]" })
        })(),
      )
    } catch (error) {
      if (c.req.raw.signal.aborted) return
      if (upstreamSignal.aborted) {
        await stream.writeSSE({
          data: JSON.stringify({ error: "That took too long. Please try again." }),
        })
        await stream.writeSSE({ data: "[DONE]" })
        return
      }
      console.error("[trips-chat] streaming error:", error)
      await stream.writeSSE({ data: JSON.stringify({ error: "Streaming error occurred" }) })
      await stream.writeSSE({ data: "[DONE]" })
    }
  })
}
