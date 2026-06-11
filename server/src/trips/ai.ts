import Groq from "groq-sdk"
import { GEMINI_BASE, GEMINI_MODEL } from "../igPlaces/gemini"
import { haversineMeters } from "../data/koreaPlaces"
import {
  aiEnhancementSchema,
  aiItinerarySchema,
  DEFAULT_ITINERARY_PROMPT,
  newId,
  nowIso,
  tripDates,
  type EnhancementRun,
  type EnhancementSuggestion,
  type ItineraryItem,
  type Trip,
  type TripDay,
} from "./types"
import type { z } from "zod"

// ── LLM + geocode dependency seams (injected in tests) ───────────────────

export type LlmCall = (args: { system: string; user: string; maxTokens?: number }) => Promise<string>

export type Geocoder = (query: string) => Promise<{ lat: number; lng: number; address?: string; placeId?: string } | null>

export type WeatherFetcher = (args: {
  lat: number
  lng: number
  dates: string[]
}) => Promise<Array<{ date: string; highC: number; lowC: number; precipitationChance: number }>>

const GROQ_MODEL = "openai/gpt-oss-120b"

export function createGroqLlm(apiKey: string): LlmCall {
  const groq = new Groq({ apiKey })
  return async ({ system, user, maxTokens }) => {
    // Same JSON-mode + reasoning_effort pattern as routes/entity.ts: gpt-oss
    // is a reasoning model whose thinking tokens count against max_tokens.
    const createParams: Record<string, unknown> = {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: maxTokens ?? 8192,
      reasoning_effort: "low",
    }
    const completion = (await groq.chat.completions.create(
      createParams as unknown as Parameters<typeof groq.chat.completions.create>[0] & { stream?: false },
    )) as Awaited<ReturnType<typeof groq.chat.completions.create>>
    if (!("choices" in completion)) throw new Error("unexpected streaming response")
    return completion.choices[0]?.message?.content ?? ""
  }
}

/**
 * Preferred trips LLM: Gemini 3.1 Flash Lite with Google Maps grounding.
 * Grounding lets the model verify venues exist and return real coordinates
 * directly (fewer geocode round-trips), and the model's context window
 * comfortably fits a full multi-day itinerary — Groq's on-demand tier
 * 8k-TPM limit 413s on trips longer than a weekend.
 */
export function createGeminiLlm(apiKey: string, fetchImpl: typeof fetch = fetch): LlmCall {
  return async ({ system, user, maxTokens }) => {
    const res = await fetchImpl(`${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
        // Maps grounding — venue verification + coordinates from ground truth.
        tools: [{ googleMaps: {} }],
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: maxTokens ?? 16_384,
          thinkingConfig: { thinkingBudget: 512 },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`gemini ${res.status}: ${body.slice(0, 300)}`)
    }
    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ?? ""
    if (!text) throw new Error("gemini returned an empty response")
    return text
  }
}

export function createGoogleGeocoder(apiKey: string): Geocoder {
  return async (query) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const body = (await res.json()) as {
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string; place_id?: string }>
    }
    const first = body.results?.[0]
    if (!first?.geometry?.location) return null
    return {
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
      address: first.formatted_address,
      placeId: first.place_id,
    }
  }
}

/** Open-Meteo daily forecast — free, no API key. Returns [] outside the
 *  ~16-day forecast window or on any failure (weather is best-effort). */
export const fetchOpenMeteoWeather: WeatherFetcher = async ({ lat, lng, dates }) => {
  try {
    const start = dates[0]
    const end = dates[dates.length - 1]
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${start}&end_date=${end}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return []
    const body = (await res.json()) as {
      daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] }
    }
    if (!body.daily) return []
    return body.daily.time.map((date, i) => ({
      date,
      highC: body.daily!.temperature_2m_max[i] ?? 0,
      lowC: body.daily!.temperature_2m_min[i] ?? 0,
      precipitationChance: body.daily!.precipitation_probability_max[i] ?? 0,
    }))
  } catch {
    return []
  }
}

// ── JSON parsing helper ──────────────────────────────────────────────────

function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  let candidate = raw.trim()
  // Models occasionally wrap JSON in code fences despite JSON mode.
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidate = fence[1]!.trim()
  const firstBrace = candidate.indexOf("{")
  const lastBrace = candidate.lastIndexOf("}")
  if (firstBrace > 0 && lastBrace > firstBrace) candidate = candidate.slice(firstBrace, lastBrace + 1)
  const parsed = JSON.parse(candidate) as unknown
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`model output failed validation: ${result.error.issues[0]?.message ?? "unknown"}`)
  }
  return result.data
}

// ── Itinerary generation ─────────────────────────────────────────────────

export interface GeneratePreferences {
  pace?: string
  budget?: string
  interests?: string
  food?: string
  mobility?: string
  mustSee?: string
  avoid?: string
  lodging?: string
  transport?: string
}

const GENERATION_SYSTEM = `You are a meticulous travel-planning agent. You produce structured itineraries as JSON only — no prose outside JSON.

Output a single JSON object with this exact shape:
{
  "summary": string,                       // 1-3 sentence trip overview
  "days": [                                 // EXACTLY one entry per trip day, in date order
    {
      "title": string,                      // short day theme, e.g. "Palaces & Hanok lanes"
      "city": string,                       // primary city/area for the day
      "notes": string,                      // optional routing/pacing notes
      "items": [
        {
          "kind": "place" | "note" | "section",
          "title": string,
          "time": "HH:mm",                  // optional, 24h local time
          "notes": string,                  // optional, 1-2 useful sentences
          "location": {                     // REQUIRED for kind "place"
            "name": string,
            "address": string,              // street address or precise area; used for geocoding
            "lat": number,                  // include real coordinates when you know them
            "lng": number,
            "category": "restaurant" | "cafe" | "bar" | "market" | "shopping" | "museum" | "palace" | "shrine" | "park" | "viewpoint" | "experience" | "landmark" | "neighborhood" | "hotel" | "transit" | "venue"
          }
        }
      ]
    }
  ]
}

Rules:
- Realistic pacing: 4-7 items per day, geographically clustered to minimize backtracking.
- Include meals (lunch + dinner) as place items with category "restaurant" or "cafe".
- Every place item MUST have a location with at least name + address. When Google Maps grounding is available, use it to verify each venue exists and include its real lat/lng; otherwise provide coordinates only when confident.
- Use "section" items sparingly as morning/afternoon/evening headers, "note" items for tips.
- Respect the traveler preferences when given. Never invent reservations or claim bookings exist.`

export async function generateItinerary(args: {
  trip: Trip
  prompt?: string
  preferences?: GeneratePreferences
  llm: LlmCall
  geocode?: Geocoder | null
}): Promise<{ summary?: string; days: TripDay[] }> {
  const { trip, preferences, llm, geocode } = args
  const dates = tripDates(trip.startDate, trip.endDate)
  const prefLines = Object.entries(preferences ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n")

  const user = [
    `Trip: ${trip.name}`,
    `Destinations: ${trip.destinations.join(", ")}`,
    `Dates: ${trip.startDate} to ${trip.endDate} (${dates.length} days)`,
    `Timezone: ${trip.timezone}`,
    trip.description ? `Context: ${trip.description}` : undefined,
    prefLines ? `Traveler preferences:\n${prefLines}` : undefined,
    `Instructions: ${args.prompt?.trim() || DEFAULT_ITINERARY_PROMPT}`,
  ]
    .filter(Boolean)
    .join("\n")

  const raw = await llm({ system: GENERATION_SYSTEM, user })
  const parsed = parseModelJson(raw, aiItinerarySchema)

  const days: TripDay[] = dates.map((date, i) => {
    const aiDay = parsed.days[i]
    return {
      id: `day-${i + 1}`,
      date,
      title: aiDay?.title,
      city: aiDay?.city,
      notes: aiDay?.notes,
      items: (aiDay?.items ?? []).map((item): ItineraryItem => ({
        id: newId("it"),
        kind: item.kind,
        title: item.title,
        time: item.time,
        endTime: item.endTime,
        notes: item.notes,
        status: item.status ?? "none",
        location: item.location
          ? {
              ...item.location,
              source: "ai",
              confidence: item.location.lat != null && item.location.lng != null ? "medium" : "low",
            }
          : undefined,
        createdBy: "ai",
      })),
    }
  })

  // Best-effort geocoding for AI places missing coordinates, so every
  // AI-added place lands in Map Mode rather than existing only as text.
  if (geocode) {
    const pending = days
      .flatMap((d) => d.items)
      .filter((i) => i.location && (i.location.lat == null || i.location.lng == null))
      .slice(0, 40)
    for (const item of pending) {
      const loc = item.location!
      try {
        const hit = await geocode([loc.name, loc.address, trip.destinations[0]].filter(Boolean).join(", "))
        if (hit) {
          loc.lat = hit.lat
          loc.lng = hit.lng
          loc.address = loc.address ?? hit.address
          loc.placeId = hit.placeId
          loc.confidence = "medium"
        }
      } catch {
        // leave un-geocoded; UI surfaces missing-coordinate places in list view
      }
    }
  }

  return { summary: parsed.summary, days }
}

// ── Enhancement ──────────────────────────────────────────────────────────

const ENHANCEMENT_SYSTEM = `You are a travel-itinerary review agent. You receive a structured itinerary plus deterministic signals (computed distances between consecutive stops, weather forecast) and return improvement suggestions as JSON only.

Output a single JSON object:
{
  "summary": string,                        // 1-3 sentences on the overall state of the plan
  "suggestions": [
    {
      "kind": "add" | "edit" | "remove" | "reorder" | "warning" | "info",
      "dayId": string,                      // day the suggestion applies to (from input)
      "itemId": string,                     // REQUIRED for edit/remove: the target item id from input
      "title": string,                      // short imperative, e.g. "Swap lunch and museum order"
      "detail": string,                     // why, with specifics; cite the signal that triggered it
      "confidence": "high" | "medium" | "low",
      "proposedItem": { ... },              // for "add": same item shape as itinerary items (kind/title/time/notes/location)
      "proposedChanges": { ... },           // for "edit": only the changed fields
      "proposedOrder": [string]             // for "reorder": full list of the day's item ids in new order
    }
  ]
}

Review for: schedule realism (too packed / large gaps), travel time between consecutive stops (use the provided distances), better geographic ordering, weather conflicts (outdoor plans on high-rain days), places that may be closed or need hour verification (verify with Google Maps grounding when available; otherwise flag as "warning" with confidence "low" rather than asserting), missing meals, and nearby alternatives worth adding.

Rules:
- Preserve the traveler's intent. Suggest, don't rewrite wholesale. Max ~8 suggestions.
- Never claim a place is closed/open as fact — phrase as a check ("verify hours") with appropriate confidence.
- Only reference itemIds and dayIds that exist in the input.`

interface TravelLeg {
  dayId: string
  fromItemId: string
  toItemId: string
  from: string
  to: string
  distanceKm: number
}

/** Deterministic pre-pass: distances between consecutive located items. */
export function computeTravelLegs(days: TripDay[]): TravelLeg[] {
  const legs: TravelLeg[] = []
  for (const day of days) {
    const located = day.items.filter((i) => i.location?.lat != null && i.location?.lng != null)
    for (let i = 1; i < located.length; i++) {
      const a = located[i - 1]!
      const b = located[i]!
      const meters = haversineMeters(
        { lat: a.location!.lat!, lng: a.location!.lng! },
        { lat: b.location!.lat!, lng: b.location!.lng! },
      )
      legs.push({
        dayId: day.id,
        fromItemId: a.id,
        toItemId: b.id,
        from: a.title,
        to: b.title,
        distanceKm: Math.round(meters / 100) / 10,
      })
    }
  }
  return legs
}

function describeDay(day: TripDay): string {
  const items = day.items
    .map((i) => {
      const parts = [
        `    - id=${i.id} kind=${i.kind} title=${JSON.stringify(i.title)}`,
        i.time ? `time=${i.time}` : "",
        i.status !== "none" ? `status=${i.status}` : "",
        i.location
          ? `location=${JSON.stringify(i.location.name)}${i.location.lat != null ? ` (${i.location.lat},${i.location.lng})` : " (no coordinates)"}`
          : "",
      ]
      return parts.filter(Boolean).join(" ")
    })
    .join("\n")
  return `  dayId=${day.id} date=${day.date}${day.city ? ` city=${day.city}` : ""}${day.title ? ` title=${JSON.stringify(day.title)}` : ""}\n${items || "    (empty)"}`
}

export async function enhanceTrip(args: {
  trip: Trip
  scope: "day" | "trip"
  dayId?: string
  llm: LlmCall
  fetchWeather?: WeatherFetcher
}): Promise<EnhancementRun> {
  const { trip, scope, dayId, llm } = args
  const days = scope === "day" ? trip.days.filter((d) => d.id === dayId) : trip.days
  const run: EnhancementRun = {
    id: newId("run"),
    tripId: trip.id,
    scope,
    dayId: scope === "day" ? dayId : undefined,
    status: "complete",
    suggestions: [],
    appliedSuggestionIds: [],
    createdAt: nowIso(),
  }

  if (days.length === 0) {
    run.status = "error"
    run.error = "day not found"
    return run
  }

  const legs = computeTravelLegs(days)
  const coords = days
    .flatMap((d) => d.items)
    .map((i) => i.location)
    .filter((l): l is NonNullable<typeof l> => l?.lat != null && l?.lng != null)
  let weatherLines = "unavailable"
  if (coords.length > 0 && args.fetchWeather) {
    const mid = coords[Math.floor(coords.length / 2)]!
    const forecast = await args.fetchWeather({
      lat: mid.lat!,
      lng: mid.lng!,
      dates: days.map((d) => d.date),
    })
    if (forecast.length > 0) {
      weatherLines = forecast
        .map((w) => `${w.date}: ${w.lowC}–${w.highC}°C, ${w.precipitationChance}% rain chance`)
        .join("\n")
    }
  }

  const user = [
    `Trip: ${trip.name} (${trip.destinations.join(", ")}), ${trip.startDate} to ${trip.endDate}, timezone ${trip.timezone}.`,
    `Scope: ${scope === "day" ? `single day ${dayId}` : "entire trip"}.`,
    `Itinerary:`,
    ...days.map(describeDay),
    `Computed distances between consecutive located stops:`,
    legs.length
      ? legs.map((l) => `  ${l.dayId}: ${l.from} → ${l.to}: ${l.distanceKm} km`).join("\n")
      : "  (none — items lack coordinates)",
    `Weather forecast near the itinerary:`,
    weatherLines,
  ].join("\n")

  try {
    const raw = await llm({ system: ENHANCEMENT_SYSTEM, user })
    const parsed = parseModelJson(raw, aiEnhancementSchema)
    run.summary = parsed.summary
    const validDayIds = new Set(days.map((d) => d.id))
    const validItemIds = new Set(days.flatMap((d) => d.items.map((i) => i.id)))
    run.suggestions = parsed.suggestions
      .filter((s) => !s.dayId || validDayIds.has(s.dayId))
      .filter((s) => !(s.kind === "edit" || s.kind === "remove") || (s.itemId && validItemIds.has(s.itemId)))
      .map(
        (s): EnhancementSuggestion => ({
          id: newId("sug"),
          kind: s.kind,
          dayId: s.dayId,
          itemId: s.itemId,
          title: s.title,
          detail: s.detail,
          confidence: s.confidence,
          proposedItem: s.proposedItem
            ? {
                id: newId("it"),
                kind: s.proposedItem.kind ?? "place",
                title: s.proposedItem.title ?? "Suggested item",
                time: s.proposedItem.time,
                endTime: s.proposedItem.endTime,
                notes: s.proposedItem.notes,
                status: s.proposedItem.status ?? "needs_review",
                location: s.proposedItem.location
                  ? { ...s.proposedItem.location, source: "ai", confidence: s.confidence }
                  : undefined,
                createdBy: "ai",
              }
            : undefined,
          proposedChanges: s.proposedChanges
            ? {
                ...(s.proposedChanges.title != null ? { title: s.proposedChanges.title } : {}),
                ...(s.proposedChanges.time != null ? { time: s.proposedChanges.time } : {}),
                ...(s.proposedChanges.endTime != null ? { endTime: s.proposedChanges.endTime } : {}),
                ...(s.proposedChanges.notes != null ? { notes: s.proposedChanges.notes } : {}),
                ...(s.proposedChanges.status != null ? { status: s.proposedChanges.status } : {}),
                ...(s.proposedChanges.location != null
                  ? { location: { ...s.proposedChanges.location, source: "ai" as const, confidence: s.confidence } }
                  : {}),
              }
            : undefined,
          proposedOrder: s.proposedOrder,
        }),
      )
  } catch (err) {
    run.status = "error"
    run.error = err instanceof Error ? err.message : String(err)
  }
  return run
}

// ── Applying accepted suggestions ────────────────────────────────────────

export function applySuggestions(trip: Trip, run: EnhancementRun, suggestionIds: string[]): {
  trip: Trip
  applied: string[]
  skipped: string[]
} {
  const applied: string[] = []
  const skipped: string[] = []
  const days = trip.days.map((d) => ({ ...d, items: [...d.items] }))

  for (const id of suggestionIds) {
    const s = run.suggestions.find((x) => x.id === id)
    if (!s || run.appliedSuggestionIds.includes(id)) {
      skipped.push(id)
      continue
    }
    const day = days.find((d) => d.id === s.dayId) ?? days[0]
    let ok = false
    switch (s.kind) {
      case "add":
        if (s.proposedItem && day) {
          day.items.push(structuredClone(s.proposedItem))
          ok = true
        }
        break
      case "edit": {
        for (const d of days) {
          const idx = d.items.findIndex((i) => i.id === s.itemId)
          if (idx >= 0 && s.proposedChanges) {
            d.items[idx] = { ...d.items[idx]!, ...structuredClone(s.proposedChanges) }
            ok = true
            break
          }
        }
        break
      }
      case "remove": {
        for (const d of days) {
          const before = d.items.length
          d.items = d.items.filter((i) => i.id !== s.itemId)
          if (d.items.length < before) {
            ok = true
            break
          }
        }
        break
      }
      case "reorder": {
        if (day && s.proposedOrder) {
          const byId = new Map(day.items.map((i) => [i.id, i]))
          const reordered = s.proposedOrder.map((iid) => byId.get(iid)).filter((i): i is ItineraryItem => !!i)
          if (reordered.length === day.items.length) {
            day.items = reordered
            ok = true
          }
        }
        break
      }
      default:
        // warning/info are informational — accepting them is a no-op ack.
        ok = true
    }
    if (ok) applied.push(id)
    else skipped.push(id)
  }

  return { trip: { ...trip, days, updatedAt: nowIso() }, applied, skipped }
}
