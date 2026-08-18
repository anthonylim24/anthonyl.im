import Groq from "groq-sdk"
import { textFromGeminiParts, type GeminiPart } from "../geminiStream"
import { GEMINI_TOOLS_MAPS, GEMINI_TOOLS_SEARCH_AND_MAPS } from "../geminiTools"
import { GEMINI_BASE, GEMINI_MODEL, geminiThinking } from "../igPlaces/gemini"
import { haversineMeters } from "../data/koreaPlaces"
import {
  aiAppearanceSchema,
  aiItemSchema,
  aiItinerarySchema,
  aiSuggestionSchema,
  DEFAULT_ITINERARY_PROMPT,
  newId,
  nowIso,
  tripDates,
  type EnhancementOutcome,
  type EnhancementRun,
  type EnhancementSuggestion,
  type ItineraryItem,
  type Trip,
  type TripDay,
} from "./types"
import { z } from "zod"

// ── LLM + geocode dependency seams (injected in tests) ───────────────────

export type LlmCall = (args: { system: string; user: string; maxTokens?: number }) => Promise<string>

export type Geocoder = (query: string) => Promise<{ lat: number; lng: number; address?: string; placeId?: string } | null>

export type WeatherFetcher = (args: {
  lat: number
  lng: number
  dates: string[]
}) => Promise<Array<{ date: string; highC: number; lowC: number; precipitationChance: number }>>

const GROQ_MODEL = "openai/gpt-oss-120b"

/** Groq on-demand TPM for gpt-oss-120b. The API reserves prompt + max_tokens. */
export const GROQ_TPM_LIMIT = 8000
const GROQ_TPM_RESERVE = 200
/** Default completion budget. 8192 alone exceeds Groq's 8k on-demand TPM. */
export const GROQ_DEFAULT_MAX_TOKENS = 2048

const TRAVELER_REVIEW_ERROR = "The review did not finish. Try again in a moment."
const TRAVELER_PARSE_ERROR = "The review came back in a form we could not use. Try again."

const TRANSIENT_GEMINI = new Set([500, 502, 503, 504])

/** Cheap char/4 estimate — enough to know whether Groq's 8k TPM can accept the call. */
export function estimatePromptTokens(system: string, user: string): number {
  return Math.ceil((system.length + user.length) / 4)
}

export function groqSafeMaxTokens(args: { system: string; user: string; maxTokens?: number }): number {
  const prompt = estimatePromptTokens(args.system, args.user)
  const budget = GROQ_TPM_LIMIT - GROQ_TPM_RESERVE - prompt
  const wanted = args.maxTokens ?? GROQ_DEFAULT_MAX_TOKENS
  return Math.max(0, Math.min(wanted, budget))
}

export function groqFitsTpm(args: { system: string; user: string; maxTokens?: number }): boolean {
  return groqSafeMaxTokens(args) >= 256
}

/** Strip provider TPM / billing dumps so travelers never see Groq or Gemini internals. */
export function travelerFacingLlmError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw === "day not found") return raw
  if (/no JSON object found|failed validation/i.test(raw)) return TRAVELER_PARSE_ERROR
  return TRAVELER_REVIEW_ERROR
}

/** One retry on Google's intermittent 5xx. 429 is left to the Groq fallback. */
async function fetchGeminiWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const first = await fetchImpl(url, init)
  if (!TRANSIENT_GEMINI.has(first.status)) return first
  await first.text().catch(() => {})
  await new Promise((r) => setTimeout(r, 800))
  return fetchImpl(url, init)
}

export function createGroqLlm(apiKey: string): LlmCall {
  const groq = new Groq({ apiKey })
  return async ({ system, user, maxTokens }) => {
    const max_tokens = groqSafeMaxTokens({ system, user, maxTokens })
    if (max_tokens < 256) {
      throw new Error("groq prompt exceeds on-demand token budget")
    }
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
      max_tokens,
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
 * Preferred trips LLM: Gemini 3.7 Flash with Search + Maps grounding.
 * Maps verifies venues and returns real coordinates; Search covers hours,
 * events, and seasonal notes. Grounding cannot use application/json mime
 * type, so the last retry is JSON-only.
 */
export function createGeminiLlm(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  opts?: { model?: string },
): LlmCall {
  const model = opts?.model ?? GEMINI_MODEL
  return async ({ system, user, maxTokens }) => {
    const run = async (mode: "search+maps" | "maps" | "json"): Promise<string> => {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.55,
        maxOutputTokens: maxTokens ?? 16_384,
        thinkingConfig: geminiThinking("low"),
      }
      // Maps/Search grounding cannot be combined with application/json mime
      // type (Gemini returns 400 INVALID_ARGUMENT). JSON mode is the last retry.
      if (mode === "json") generationConfig.responseMimeType = "application/json"
      const tools =
        mode === "search+maps" ? GEMINI_TOOLS_SEARCH_AND_MAPS : mode === "maps" ? GEMINI_TOOLS_MAPS : undefined

      const res = await fetchGeminiWithRetry(fetchImpl, `${GEMINI_BASE}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
          ...(tools ? { tools } : {}),
          generationConfig,
        }),
        signal: AbortSignal.timeout(90_000),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`gemini ${res.status}: ${body.slice(0, 300)}`)
      }
      const j = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: GeminiPart[] }
          finishReason?: string
        }>
        promptFeedback?: { blockReason?: string }
      }
      if (j.promptFeedback?.blockReason) {
        throw new Error(`gemini blocked: ${j.promptFeedback.blockReason}`)
      }
      const candidate = j.candidates?.[0]
      const text = textFromGeminiParts(candidate?.content?.parts)
      if (!text) {
        const reason = candidate?.finishReason ?? "empty"
        throw new Error(`gemini returned an empty response (${reason})`)
      }
      return text
    }

    try {
      return await run("search+maps")
    } catch (err) {
      const first = err instanceof Error ? err.message : String(err)
      console.warn(`[trips/ai] Search+Maps Gemini failed (${first}); retrying Maps-only`)
      try {
        return await run("maps")
      } catch (mapsErr) {
        const msg = mapsErr instanceof Error ? mapsErr.message : String(mapsErr)
        console.warn(`[trips/ai] Maps-grounded Gemini failed (${msg}); retrying JSON-only`)
        return await run("json")
      }
    }
  }
}

/**
 * Try Gemini first. Groq is a last resort, and only when the prompt fits
 * Groq's 8k on-demand TPM. If Groq also fails, rethrow the Gemini error so
 * travelers are not shown a Groq 413 that replaced a useful primary failure.
 */
export function withLlmFallback(primary: LlmCall, fallback: LlmCall): LlmCall {
  return async (opts) => {
    try {
      return await primary(opts)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!groqFitsTpm(opts)) {
        console.warn(`[trips/ai] primary LLM failed; skipping Groq (prompt exceeds Groq TPM) (${msg})`)
        throw err
      }
      console.warn(`[trips/ai] primary LLM failed; falling back (${msg})`)
      try {
        return await fallback(opts)
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        console.warn(`[trips/ai] fallback LLM failed; surfacing primary error (${fallbackMsg})`)
        throw err
      }
    }
  }
}

/** Gemini (Search+Maps → Maps → JSON retry) with Groq as final fallback. */
export function createTripsLlm(args: {
  geminiApiKey?: string | null
  groqApiKey?: string | null
}): LlmCall | null {
  const gemini = args.geminiApiKey ? createGeminiLlm(args.geminiApiKey) : null
  const groq = args.groqApiKey ? createGroqLlm(args.groqApiKey) : null
  if (!gemini && !groq) return null
  if (!gemini) return groq
  if (!groq) return gemini
  return withLlmFallback(gemini, groq)
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

/** Extract a JSON value from raw model text. Handles code fences, leading
 *  AND trailing prose (grounded Gemini appends source notes after the JSON),
 *  and double-encoded output (a JSON string whose content is itself JSON —
 *  observed from grounded Flash models with the Maps grounding tool). */
export function extractModelJson(raw: string): unknown {
  let candidate = raw.trim()
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidate = fence[1]!.trim()
  let parsed: unknown
  try {
    // Whole-string parse first — brace-slicing a double-encoded JSON string
    // would mangle its escaped quotes.
    parsed = JSON.parse(candidate)
  } catch {
    const firstBrace = candidate.indexOf("{")
    const lastBrace = candidate.lastIndexOf("}")
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error("no JSON object found in model output")
    parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown
  }
  if (typeof parsed === "string") parsed = JSON.parse(parsed) as unknown
  return parsed
}

function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed = extractModelJson(raw)
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue && issue.path.length ? ` at ${issue.path.join(".")}` : ""
    console.warn(
      `[trips/ai] model output failed validation: ${issue?.message}${path} | raw: ${raw.slice(0, 400)}`,
    )
    throw new Error(`model output failed validation: ${issue?.message ?? "unknown"}${path}`)
  }
  return result.data
}

// ── Salvage parsing ──────────────────────────────────────────────────────
//
// One malformed entry from the model must never fail the whole response.
// Top-level shape is validated loosely, then each day/item/suggestion is
// validated individually — invalid entries are dropped (and counted in the
// logs) instead of 502ing the request.

type AiDay = z.infer<typeof aiItinerarySchema>["days"][number]
type AiSuggestion = z.infer<typeof aiSuggestionSchema>

const looseDaySchema = z.object({
  title: z.string().max(200).optional(),
  // ZWJ / flag emoji sequences regularly exceed 8 UTF-16 code units.
  emoji: z.string().max(32).optional(),
  city: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  neighborhoods: z.array(z.string().min(1).max(80)).max(12).optional(),
  items: z.array(z.unknown()).max(60).default([]),
})

/** Pad "9:00" / "9:00 am" → "09:00". Returns original string if unparseable
 *  so the schema can still reject truly bad values. */
export function normalizeTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i)
  if (!m) return raw
  let h = Number(m[1])
  const min = m[2]!
  const ap = m[3]?.toLowerCase()
  if (ap === "pm" && h < 12) h += 12
  if (ap === "am" && h === 12) h = 0
  if (!Number.isFinite(h) || h > 23 || Number(min) > 59) return raw
  return `${String(h).padStart(2, "0")}:${min}`
}

function coerceCoord(value: unknown): number | unknown {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return value
}

/** Fold common model deviations before Zod: unpadded times, string lat/lng. */
export function normalizeAiItem(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw
  const item = { ...(raw as Record<string, unknown>) }
  if (typeof item.time === "string") item.time = normalizeTime(item.time)
  if (typeof item.endTime === "string") item.endTime = normalizeTime(item.endTime)
  if (item.location && typeof item.location === "object" && !Array.isArray(item.location)) {
    const loc = { ...(item.location as Record<string, unknown>) }
    loc.lat = coerceCoord(loc.lat)
    loc.lng = coerceCoord(loc.lng)
    item.location = loc
  }
  return item
}

export function salvageItinerary(raw: string): {
  summary?: string
  appearance?: z.infer<typeof aiAppearanceSchema>
  days: AiDay[]
} {
  const loose = parseModelJson(
    raw,
    z.object({
      summary: z.string().max(2000).optional(),
      appearance: z.unknown().optional(),
      days: z.array(z.unknown()).max(60).default([]),
    }),
  )
  const appearance = aiAppearanceSchema.safeParse(loose.appearance)
  let dropped = 0
  const days: AiDay[] = loose.days.map((rawDay) => {
    const day = looseDaySchema.safeParse(rawDay)
    if (!day.success) {
      dropped++
      return { items: [] }
    }
    const items = day.data.items
      .map((rawItem) => aiItemSchema.safeParse(normalizeAiItem(rawItem)))
      .filter((r) => {
        if (!r.success) dropped++
        return r.success
      })
      .map((r) => (r as { success: true; data: z.infer<typeof aiItemSchema> }).data)
    return { ...day.data, items }
  })
  if (dropped > 0) console.warn(`[trips/ai] generation: dropped ${dropped} malformed entr${dropped === 1 ? "y" : "ies"}`)
  return { summary: loose.summary, appearance: appearance.success ? appearance.data : undefined, days }
}

/** Fold common model deviations into valid shapes before validating: string
 *  proposedChanges/proposedItem become part of the detail text. */
function normalizeSuggestion(rawSug: unknown): unknown {
  if (typeof rawSug !== "object" || rawSug === null) return rawSug
  const s = { ...(rawSug as Record<string, unknown>) }
  for (const key of ["proposedChanges", "proposedItem", "proposedOrder"] as const) {
    if (typeof s[key] === "string") {
      s.detail = [s.detail, s[key]].filter((v) => typeof v === "string" && v).join(" · ")
      delete s[key]
    }
  }
  if (typeof s.detail !== "string") s.detail = ""
  if (s.proposedItem != null) s.proposedItem = normalizeAiItem(s.proposedItem)
  if (s.proposedChanges != null) s.proposedChanges = normalizeAiItem(s.proposedChanges)
  return s
}

export function salvageSuggestions(raw: string): {
  summary?: string
  outcome?: EnhancementOutcome
  outcomeReason?: string
  suggestions: AiSuggestion[]
} {
  const loose = parseModelJson(
    raw,
    z.object({
      summary: z.string().max(2000).optional(),
      outcome: z.enum(["added_places", "no_adds_needed", "no_adds_possible"]).optional(),
      outcomeReason: z.string().max(2000).optional(),
      suggestions: z.array(z.unknown()).max(60).default([]),
    }),
  )
  let dropped = 0
  const suggestions: AiSuggestion[] = []
  for (const rawSug of loose.suggestions) {
    const r = aiSuggestionSchema.safeParse(normalizeSuggestion(rawSug))
    if (r.success) suggestions.push(r.data)
    else dropped++
  }
  if (dropped > 0) console.warn(`[trips/ai] enhancement: dropped ${dropped} malformed suggestion(s)`)
  return {
    summary: loose.summary,
    outcome: loose.outcome,
    outcomeReason: loose.outcomeReason,
    suggestions,
  }
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
  "appearance": {                           // editorial theming for the trip's dossier-style pages
    "accent": "rose" | "amber" | "emerald" | "sky" | "violet",  // pick the family that fits the destination's mood
    "eyebrow": string,                      // 2-3 word kicker, e.g. "The dossier"
    "subtitle": string,                     // italic serif line under the title, e.g. "a Seoul & Busan dossier"
    "headline": string                      // 2-3 sentence editorial paragraph capturing the trip's spirit
  },
  "days": [                                 // EXACTLY one entry per trip day, in date order
    {
      "title": string,                      // short day theme, e.g. "Palaces & Hanok lanes"
      "emoji": string,                      // ONE expressive emoji for the day, e.g. "🏯"
      "city": string,                       // primary city/area for the day
      "notes": string,                      // 1-2 sentence editorial day theme (rendered as prose under the title)
      "neighborhoods": [string],            // 2-4 neighborhood/area names featured this day
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
- Every place item MUST have a location with at least name + address. When Google Maps grounding is available, use it to verify each venue exists and include its real lat/lng; use Google Search for hours, seasonal closures, and events. Otherwise provide coordinates only when confident.
- Use "section" items sparingly as morning/afternoon/evening headers, "note" items for tips.
- Respect the traveler preferences when given. Never invent reservations or claim bookings exist.
- "notes" at the day level is editorial voice (a travel-dossier one-liner), not logistics; keep logistics in item notes.`

export async function generateItinerary(args: {
  trip: Trip
  prompt?: string
  preferences?: GeneratePreferences
  llm: LlmCall
  geocode?: Geocoder | null
}): Promise<{ summary?: string; appearance?: Trip["appearance"]; days: TripDay[] }> {
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
  const parsed = salvageItinerary(raw)
  const appearance = parsed.appearance

  const days: TripDay[] = dates.map((date, i) => {
    const aiDay = parsed.days[i]
    return {
      id: `day-${i + 1}`,
      date,
      title: aiDay?.title,
      emoji: aiDay?.emoji,
      city: aiDay?.city,
      notes: aiDay?.notes,
      neighborhoods: aiDay?.neighborhoods,
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

  if (geocode) {
    await fillMissingCoordinates(
      days.flatMap((d) => d.items),
      geocode,
      trip.destinations[0],
    )
  }

  return { summary: parsed.summary, appearance, days }
}

/** Best-effort geocoding for AI places missing coordinates, so every
 *  AI-added place lands in Map Mode rather than existing only as text.
 *  Parallel batches keep long trips under the client/proxy timeout. */
export async function fillMissingCoordinates(
  items: ItineraryItem[],
  geocode: Geocoder,
  destination?: string,
): Promise<void> {
  const pending = items
    .filter((i) => i.location && (i.location.lat == null || i.location.lng == null))
    .slice(0, 40)
  const CONCURRENCY = 6
  const deadline = Date.now() + 12_000
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) break
    const batch = pending.slice(i, i + CONCURRENCY)
    const remaining = Math.max(1, deadline - Date.now())
    await Promise.race([
      Promise.all(
        batch.map(async (item) => {
          const loc = item.location!
          try {
            const hit = await geocode([loc.name, loc.address, destination].filter(Boolean).join(", "))
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
        }),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, remaining)),
    ])
  }
}

// ── Enhancement ──────────────────────────────────────────────────────────

const ENHANCEMENT_SYSTEM = `You are a travel-itinerary review agent. You receive a structured itinerary plus deterministic signals (computed distances between consecutive stops, weather forecast) and return improvement suggestions as JSON only.

Output a single JSON object:
{
  "summary": string,                        // 1-3 sentences on the overall state of the plan
  "outcome": "added_places" | "no_adds_needed" | "no_adds_possible",
  "outcomeReason": string,                  // REQUIRED. 1-3 sentences: why you added places, or why you did not.
  "suggestions": [
    {
      "kind": "add" | "edit" | "remove" | "reorder" | "warning" | "info",
      "dayId": string,                      // REQUIRED for add/edit/remove/reorder — must be a dayId from input
      "itemId": string,                     // REQUIRED for edit/remove: the target item id from input
      "title": string,                      // short imperative, e.g. "Add a late lunch near Insadong"
      "detail": string,                     // why, with specifics; cite the signal that triggered it
      "confidence": "high" | "medium" | "low",
      "proposedItem": { ... },              // REQUIRED for "add": kind/title/time/notes/location (location.name + address)
      "proposedChanges": { ... },           // for "edit": only the changed fields
      "proposedOrder": [string]             // for "reorder": full list of the day's item ids in new order
    }
  ]
}

Your primary job is to add worthwhile stops when the day has room. Review for: missing meals, empty or thin days (fewer than 4 place items), long gaps between timed stops, nearby alternatives that fit the day's geography, weather conflicts (outdoor plans on high-rain days), travel-time backtracking, and places that may need hour verification (verify with Google Maps grounding and Google Search when available; otherwise flag as "warning" with confidence "low").

Rules:
- ALWAYS set outcome + outcomeReason. The traveler must understand why places were or were not added.
- If a day is empty, thin, missing a meal, or has a long gap, emit at least one "add" with a full proposedItem (kind "place", title, location.name, location.address; lat/lng when known). Set outcome to "added_places".
- If the day is already well-paced (meals covered, 4–7 clustered stops, no useful gap), set outcome to "no_adds_needed" and explain specifically (e.g. "Day 2 already has lunch, dinner, and five clustered Jongno stops; another venue would overpack the afternoon.").
- If you wanted to add but could not (unknown area, no grounded venue, traveler asked to keep it sparse), set outcome to "no_adds_possible" and say why.
- Never emit kind "add" without a proposedItem object and a valid dayId. Use "info" if you only have a tip.
- Preserve the traveler's intent. Do not rewrite wholesale. Max ~8 suggestions.
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
  /** Optional traveler focus steering the review. */
  prompt?: string
  llm: LlmCall
  fetchWeather?: WeatherFetcher
  geocode?: Geocoder | null
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
    run.outcome = "no_adds_possible"
    run.outcomeReason = "That day is not on this trip, so nothing was added."
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
      // Persisted by the route onto day.weather — keeps trip pages' weather
      // chips live without a manual edit.
      run.weatherByDate = Object.fromEntries(
        forecast.map((w) => [
          w.date,
          { highC: Math.round(w.highC), lowC: Math.round(w.lowC), condition: `${w.precipitationChance}% rain` },
        ]),
      )
      weatherLines = forecast
        .map((w) => `${w.date}: ${w.lowC}–${w.highC}°C, ${w.precipitationChance}% rain chance`)
        .join("\n")
    }
  }

  const user = [
    `Trip: ${trip.name} (${trip.destinations.join(", ")}), ${trip.startDate} to ${trip.endDate}, timezone ${trip.timezone}.`,
    `Scope: ${scope === "day" ? `single day ${dayId}` : "entire trip"}.`,
    args.prompt?.trim()
      ? `Traveler's focus for this review (prioritize this): ${args.prompt.trim()}`
      : undefined,
    `Itinerary:`,
    ...days.map(describeDay),
    `Computed distances between consecutive located stops:`,
    legs.length
      ? legs.map((l) => `  ${l.dayId}: ${l.from} → ${l.to}: ${l.distanceKm} km`).join("\n")
      : "  (none — items lack coordinates)",
    `Weather forecast near the itinerary:`,
    weatherLines,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")

  try {
    const raw = await llm({ system: ENHANCEMENT_SYSTEM, user })
    const parsed = salvageSuggestions(raw)
    run.summary = parsed.summary
    const validDayIds = new Set(days.map((d) => d.id))
    const validItemIds = new Set(days.flatMap((d) => d.items.map((i) => i.id)))
    run.suggestions = parsed.suggestions
      .filter((s) => !s.dayId || validDayIds.has(s.dayId))
      .filter((s) => s.kind !== "add" || (s.dayId && validDayIds.has(s.dayId) && s.proposedItem))
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
    if (args.geocode) {
      await fillMissingCoordinates(
        run.suggestions.flatMap((s) => (s.proposedItem ? [s.proposedItem] : [])),
        args.geocode,
        trip.destinations[0],
      )
    }
    const addableCount = addableSuggestionIds(run).length
    const resolved = resolveEnhancementOutcome({
      suggestions: run.suggestions,
      summary: parsed.summary,
      modelOutcome: parsed.outcome,
      modelReason: parsed.outcomeReason,
      // Route auto-applies these next; stamp the outcome the traveler will see.
      appliedAddCount: addableCount,
    })
    run.outcome = resolved.outcome
    run.outcomeReason = resolved.outcomeReason
  } catch (err) {
    run.status = "error"
    run.error = travelerFacingLlmError(err)
    run.outcome = "no_adds_possible"
    run.outcomeReason = "The AI review failed before it could add places."
  }
  return run
}

/** Adds safe to land on the itinerary: real day + a place with a name. */
export function isAddableSuggestion(s: EnhancementSuggestion): boolean {
  if (s.kind !== "add" || !s.dayId || !s.proposedItem) return false
  if (s.proposedItem.kind === "place") {
    return Boolean(s.proposedItem.location?.name?.trim())
  }
  return Boolean(s.proposedItem.title.trim())
}

export function addableSuggestionIds(run: EnhancementRun): string[] {
  return run.suggestions.filter(isAddableSuggestion).map((s) => s.id)
}

export function resolveEnhancementOutcome(args: {
  suggestions: EnhancementSuggestion[]
  summary?: string
  modelOutcome?: EnhancementOutcome
  modelReason?: string
  appliedAddCount: number
}): { outcome: EnhancementOutcome; outcomeReason: string } {
  const addableAdds = args.suggestions.filter(isAddableSuggestion).length
  const anyAdds = args.suggestions.filter((s) => s.kind === "add").length
  const reason = args.modelReason?.trim() || args.summary?.trim()
  if (args.appliedAddCount > 0) {
    return {
      outcome: "added_places",
      outcomeReason:
        reason ||
        `Added ${args.appliedAddCount} new stop${args.appliedAddCount === 1 ? "" : "s"} to fill gaps in the itinerary.`,
    }
  }
  if (args.modelOutcome === "added_places" && addableAdds === 0) {
    return {
      outcome: "no_adds_possible",
      outcomeReason: "Suggested adds were dropped (invalid day or missing place data).",
    }
  }
  if (addableAdds > 0 || anyAdds > 0) {
    return {
      outcome: "no_adds_possible",
      outcomeReason: reason || "Suggested places could not be added (missing day or place data).",
    }
  }
  if (args.modelOutcome === "no_adds_possible") {
    return {
      outcome: "no_adds_possible",
      outcomeReason: reason || "Could not find additional places that fit this day's pace and geography.",
    }
  }
  return {
    outcome: "no_adds_needed",
    outcomeReason:
      reason || "The itinerary already covers meals and clustered stops; adding more would overpack the day.",
  }
}

/** Apply every valid add suggestion and stamp the run with the final outcome. */
export function autoApplyAddSuggestions(
  trip: Trip,
  run: EnhancementRun,
): { trip: Trip; run: EnhancementRun; applied: string[]; skipped: string[] } {
  const ids = addableSuggestionIds(run)
  if (ids.length === 0) {
    const resolved = resolveEnhancementOutcome({
      suggestions: run.suggestions,
      summary: run.summary,
      modelOutcome: run.outcome,
      modelReason: run.outcomeReason,
      appliedAddCount: 0,
    })
    return { trip, run: { ...run, ...resolved }, applied: [], skipped: [] }
  }
  const result = applySuggestions(trip, run, ids)
  const nextRun: EnhancementRun = {
    ...run,
    appliedSuggestionIds: [...run.appliedSuggestionIds, ...result.applied],
    ...resolveEnhancementOutcome({
      suggestions: run.suggestions,
      summary: run.summary,
      modelOutcome: run.outcome,
      modelReason: run.outcomeReason,
      appliedAddCount: result.applied.length,
    }),
  }
  return { trip: result.trip, run: nextRun, applied: result.applied, skipped: result.skipped }
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
    const day = s.dayId ? days.find((d) => d.id === s.dayId) : undefined
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
