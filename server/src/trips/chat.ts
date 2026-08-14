import { streamSSE } from "hono/streaming"
import type { Context } from "hono"
import {
  createAddPlacesFenceFilter,
  dropPlacesAlreadyOnTrip,
  enrichPlacesWithGeocode,
  mergeConciergePlaces,
  parseAddPlacesTrailer,
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
    `Day ${n} · ${day.date}` +
    (day.city ? ` · ${day.city}` : "") +
    (day.title ? ` — ${day.title}` : "")
  )
}

function fmtDayOverview(day: TripDay, index: number): string {
  const booked = day.items.filter((i) => i.kind === "reservation" || i.status === "booked").length
  const titles = day.items
    .filter((i) => i.kind !== "section")
    .slice(0, MAX_ITEMS_PER_OVERVIEW_DAY)
    .map((i) => clip(i.title, 40) || "(untitled)")
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
  return lines.join("\n")
}

/** Compact itinerary digest for the concierge. Focused day is expanded;
 *  every other day is a one-line overview so cross-day questions still work. */
export function buildTripChatContext(trip: Trip, dayId?: string): string {
  const focusedIndex = dayId ? trip.days.findIndex((d) => d.id === dayId) : -1
  const focused = focusedIndex >= 0 ? trip.days[focusedIndex] : undefined

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
  } else {
    sections.push(`ALL DAYS (overview):\n${trip.days.map((d, i) => fmtDayOverview(d, i)).join("\n")}`)
  }

  if (focused) {
    sections.push(`FOCUSED DAY (the user is currently viewing this day):\n${fmtDayDetail(focused, focusedIndex)}`)
  }

  return sections.join("\n\n")
}

export function buildTripChatSystemInstruction(trip: Trip, dayId?: string): string {
  const nowLocal = new Date().toLocaleString("en-US", {
    timeZone: trip.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const dest = trip.destinations.join(" + ") || "this trip"

  return [
    `You are the trip concierge for a private itinerary: ${trip.name} (${dest}, ${trip.startDate} to ${trip.endDate}). ` +
      `You help during planning and in-trip lookups: restaurants and where to eat, the day's plan, ` +
      `reservations and timings, neighborhoods, transit, and general logistics.`,
    `Today's date in the trip time zone (${trip.timezone}) is ${nowLocal}.`,
    `RULES:`,
    `1. Reservations, times, and confirmation numbers come ONLY from the itinerary data below — never invent those. For restaurants, hours, reviews, transit, weather, events, and neighborhood questions, use Google Search and Google Maps grounding so answers stay current. Say when a detail is from Maps or the live web rather than the saved itinerary.`,
    `2. Be concise and mobile-friendly: short paragraphs, bullet points, bold the key thing. This is read on a phone, often one-handed.`,
    `3. When recommending a place, prefer ones already on the itinerary and mention why. Surface same-neighborhood / same-city picks first when a focused day is set. You may recommend new venues when the traveler asks — verify each with Maps.`,
    `4. For reservations, lead with the time and status. Flag anything pending, tentative, or needs_review.`,
    `5. Use a warm, confident concierge tone: like a well-briefed travel host, not a search engine.`,
    `6. Use Markdown for structure (bold, bullets). Keep it tight.`,
    `7. When you recommend a venue that is NOT already on the itinerary and the traveler might add it, append this machine-only block AFTER the reply (never inside a sentence):`,
    `:::add-places`,
    `[{"name":"Venue","address":"street address","lat":0,"lng":0,"category":"restaurant","dayId":"${dayId ?? ""}","notes":"one-line why","placeId":"","mapsUrl":""}]`,
    `:::`,
    `Use real Maps-verified name + address. Include lat/lng when Maps has them. Omit dayId if unsure. Omit the block for logistics-only answers or places already listed above.`,
    ``,
    `=== ITINERARY DATA ===`,
    buildTripChatContext(trip, dayId),
  ].join("\n")
}

export function tripLatLngHint(trip: Trip, dayId?: string): { latitude: number; longitude: number } | null {
  const focused = dayId ? trip.days.filter((d) => d.id === dayId) : []
  const pools = focused.length ? [focused, trip.days] : [trip.days]
  for (const days of pools) {
    const pts: Array<{ lat: number; lng: number }> = []
    for (const day of days) {
      for (const item of day.items) {
        const lat = item.location?.lat
        const lng = item.location?.lng
        if (typeof lat === "number" && typeof lng === "number") pts.push({ lat, lng })
      }
    }
    if (pts.length === 0) continue
    return {
      latitude: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      longitude: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
    }
  }
  return null
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
      maxOutputTokens: 2048,
      // 3.7 Flash rejects `minimal` (400). `low` is the snappy chat tier.
      thinkingConfig: geminiThinking("low"),
    },
  }

  // Search + Maps grounding can sit quiet for a while before the first token.
  const upstreamSignal = AbortSignal.any([AbortSignal.timeout(120_000), c.req.raw.signal])
  const toolConfig = mapsRetrievalConfig(tripLatLngHint(args.trip, args.dayId))

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

          if (places.length) await stream.writeSSE({ data: JSON.stringify({ places }) })
          if (sources.length) await stream.writeSSE({ data: JSON.stringify({ sources }) })

          await stream.writeSSE({ data: "[DONE]" })
        })(),
      )
    } catch (error) {
      if ((error as Error).name === "AbortError" && c.req.raw.signal.aborted) return
      if ((error as Error).name === "AbortError") {
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
