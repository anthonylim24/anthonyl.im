import Groq from "groq-sdk"
import { textFromGeminiParts, type GeminiPart } from "../geminiStream"
import {
  fetchGeminiWithTransientRetry,
  GEMINI_TOOLS_MAPS,
  GEMINI_TOOLS_SEARCH,
  GEMINI_TOOLS_SEARCH_AND_MAPS,
  mapsRetrievalConfig,
  toolsIncludeMaps,
  type GeminiToolList,
} from "../geminiTools"
import { tripLatLngHint } from "./latLngHint"
import { GEMINI_BASE, GEMINI_MODEL, geminiThinking } from "../igPlaces/gemini"
import { haversineMeters } from "../data/koreaPlaces"
import { ENHANCEMENT_SYSTEM, GENERATION_SYSTEM, OUTLINE_SYSTEM } from "./prompts"
import { repairTruncatedJson } from "./jsonRepair"
import { baseByDay, describeBases, isFixed, isLodging } from "./lodging"
import { analyseDay, describeSignals, insertByTime, shorterRoute, weekday } from "./signals"

export { weekday }
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

export type LlmCall = (args: {
  system: string
  user: string
  maxTokens?: number
  latLng?: { latitude: number; longitude: number }
  /** How hard the model should think. Drafting and reviewing a plan is
   *  routing + scheduling, so those ask for "medium"; default is "low". */
  effort?: "low" | "medium" | "high"
}) => Promise<string>

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

// Maps and Search grounding cannot share a request on current models
// (400 "cannot be combined"), so the ladder starts at Maps alone.
const GEMINI_MODES = ["maps", "search", "json"] as const
type GeminiMode = (typeof GEMINI_MODES)[number]

function toolsForGeminiMode(mode: GeminiMode): GeminiToolList | undefined {
  if (mode === "search+maps") return GEMINI_TOOLS_SEARCH_AND_MAPS
  if (mode === "maps") return GEMINI_TOOLS_MAPS
  if (mode === "search") return GEMINI_TOOLS_SEARCH
  return undefined
}

function isGeminiQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\bgemini 429\b/.test(msg)
}

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
 * Preferred trips LLM: Gemini (GEMINI_MODEL) with the same tool ladder as chat
 * (Search+Maps → Maps → Search → JSON). Maps calls send retrieval latLng
 * when the itinerary has coordinates — without that, Gemini often 400s and
 * the old path treated that as a total Gemini failure.
 *
 * 429 is retried once on the same request, then thrown (stepping down tools
 * does not fix quota). Empty / 400 responses step down the ladder.
 */
export function createGeminiLlm(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  opts?: { model?: string },
): LlmCall {
  const model = opts?.model ?? GEMINI_MODEL
  return async ({ system, user, maxTokens, latLng, effort }) => {
    const toolConfig = mapsRetrievalConfig(latLng)
    const run = async (mode: GeminiMode): Promise<string> => {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.55,
        // Thinking tokens count against this cap: 16k was cutting long
        // drafts off mid-JSON. The model's own default is the ceiling.
        maxOutputTokens: maxTokens ?? 65_536,
        thinkingConfig: geminiThinking(effort ?? "low"),
      }
      // Maps/Search grounding cannot be combined with application/json mime
      // type (Gemini returns 400 INVALID_ARGUMENT). JSON mode is the last retry.
      if (mode === "json") generationConfig.responseMimeType = "application/json"
      const tools = toolsForGeminiMode(mode)
      const requestOnce = () =>
        fetchGeminiWithTransientRetry(
          `${GEMINI_BASE}/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
              ...(tools ? { tools } : {}),
              ...(toolConfig && toolsIncludeMaps(tools) ? { toolConfig } : {}),
              generationConfig,
            }),
            signal: AbortSignal.timeout(effort && effort !== "low" ? 150_000 : 90_000),
          },
          fetchImpl,
        )

      let res = await requestOnce()
      if (res.status === 429) {
        await res.text().catch(() => {})
        const raw = Number(res.headers.get("retry-after"))
        const waitMs = Number.isFinite(raw) && raw > 0 ? Math.min(raw * 1000, 4_000) : 200
        await new Promise((r) => setTimeout(r, waitMs))
        res = await requestOnce()
      }
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

    let lastErr: Error | null = null
    for (const mode of GEMINI_MODES) {
      try {
        return await run(mode)
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        if (isGeminiQuotaError(lastErr)) {
          console.warn(`[trips/ai] Gemini ${mode} hit 429; not stepping down tools`)
          throw lastErr
        }
        console.warn(`[trips/ai] Gemini ${mode} failed (${lastErr.message}); trying next`)
      }
    }
    throw lastErr ?? new Error("gemini failed")
  }
}

/**
 * Optional wrapper kept for tests. `createTripsLlm` does not use this:
 * Gemini is used alone when configured. Groq is only selected when
 * Gemini is missing.
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

/** Gemini when configured. Groq only if Gemini is missing — it is not a reliability fallback. */
export function pickTripsLlm(gemini: LlmCall | null, groq: LlmCall | null): LlmCall | null {
  return gemini ?? groq ?? null
}

export function createTripsLlm(args: {
  geminiApiKey?: string | null
  groqApiKey?: string | null
}): LlmCall | null {
  const gemini = args.geminiApiKey ? createGeminiLlm(args.geminiApiKey) : null
  const groq = args.groqApiKey ? createGroqLlm(args.groqApiKey) : null
  // Gemini leads; Groq is the backup when a Gemini call fails outright (and
  // the prompt fits Groq's token budget), and the only model without a key.
  return gemini && groq ? withLlmFallback(gemini, groq) : pickTripsLlm(gemini, groq)
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

/** Keyless fallback geocoder (Photon / OpenStreetMap). Same contract as the
 *  Google geocoder: null on a miss. Never throws — a failed lookup just
 *  leaves the place without coordinates. */
export function createPhotonGeocoder(fetchImpl: typeof fetch = fetch): Geocoder {
  return async (query) => {
    const q = query.trim()
    if (!q) return null
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) })
      if (!res.ok) return null
      const body = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: unknown }
          properties?: Record<string, unknown>
        }>
      }
      const first = body.features?.[0]
      const coords = first?.geometry?.coordinates
      if (!Array.isArray(coords)) return null
      const [lng, lat] = coords as unknown[]
      if (typeof lat !== "number" || typeof lng !== "number") return null
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
      const props = first?.properties ?? {}
      const text = (key: string) => (typeof props[key] === "string" && props[key] ? (props[key] as string) : undefined)
      const street = [text("housenumber"), text("street")].filter(Boolean).join(" ")
      const parts = [text("name"), street || undefined, text("city"), text("country")].filter(
        (part, i, all): part is string => !!part && all.indexOf(part) === i,
      )
      return { lat, lng, address: parts.length ? parts.join(", ") : undefined }
    } catch {
      return null
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
    try {
      parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown
    } catch {
      // Cut off mid-answer (output cap, dropped stream): keep what arrived whole.
      const repaired = repairTruncatedJson(candidate.slice(firstBrace))
      if (!repaired) throw new Error("no JSON object found in model output")
      try {
        parsed = JSON.parse(repaired) as unknown
      } catch {
        throw new Error("no JSON object found in model output")
      }
      console.warn("[trips/ai] model output was cut off; recovered the complete part")
    }
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
  // Map listings carry marketing suffixes ("Mei Sum | Chinese Dim Sum"): the
  // stop is called by the venue's name alone.
  if (typeof item.title === "string" && / \| /.test(item.title)) item.title = item.title.split(" | ")[0]!.trim() || item.title
  if (typeof item.time === "string") item.time = normalizeTime(item.time)
  if (typeof item.endTime === "string") item.endTime = normalizeTime(item.endTime)
  // Models sometimes echo the status token into the prose; it is a field.
  if (typeof item.notes === "string") {
    if (/needs[_ ]review/i.test(item.notes) && item.status == null) item.status = "needs_review"
    item.notes = item.notes.replace(/\s*\(?\bneeds[_ ]review\b\)?/gi, "").replace(/\s+([;,.])/g, "$1").trim()
  }
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
  let why: string | undefined
  const suggestions: AiSuggestion[] = []
  for (const rawSug of loose.suggestions) {
    const r = aiSuggestionSchema.safeParse(normalizeSuggestion(rawSug))
    if (r.success) suggestions.push(r.data)
    else {
      dropped++
      // Field path + reason only: enough to fix the schema, no itinerary text.
      why ??= r.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    }
  }
  if (dropped > 0) console.warn(`[trips/ai] enhancement: dropped ${dropped} malformed suggestion(s) (${why})`)
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

/** Trips up to this many days are drafted in one call; longer ones in parts. */
const SINGLE_CALL_DAYS = 4
/** Days per part when a long trip is drafted in parts. */
const CHUNK_DAYS = 3
const CHUNK_CONCURRENCY = 3

function toTripItems(items: AiDay["items"]): ItineraryItem[] {
  return items.map((item): ItineraryItem => ({
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
  }))
}

const stopCount = (day: AiDay | undefined) => (day?.items ?? []).filter((item) => item.kind === "place").length

/** Enough stops to be a plan rather than a fragment: fewer earns a retry. */
const dayLooksDrafted = (day: AiDay | undefined) => stopCount(day) >= 2

/** Keep whichever attempt at a day has more in it. */
const fuller = (a: AiDay | undefined, b: AiDay | undefined) => (stopCount(b) > stopCount(a) || !a ? (b ?? a) : a)

export interface GeneratedItinerary {
  summary?: string
  appearance?: Trip["appearance"]
  days: TripDay[]
  /** 1-based numbers of days the draft could not fill (after retries). */
  incompleteDays: number[]
}

export async function generateItinerary(args: {
  trip: Trip
  prompt?: string
  preferences?: GeneratePreferences
  llm: LlmCall
  geocode?: Geocoder | null
}): Promise<GeneratedItinerary> {
  const { trip, preferences, llm, geocode } = args
  const dates = tripDates(trip.startDate, trip.endDate)
  const prefLines = Object.entries(preferences ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n")

  // What the traveller has already committed to survives a redraft: the
  // model plans around it, and it is merged back afterwards.
  const fixedByDate = new Map<string, ItineraryItem[]>()
  for (const day of trip.days) {
    const fixed = day.items.filter(isFixed)
    if (fixed.length) fixedByDate.set(day.date, fixed)
  }
  const fixedLines = dates.flatMap((date, i) =>
    (fixedByDate.get(date) ?? []).map((item) => {
      const loc = item.location
      const at = loc?.lat != null && loc.lng != null ? ` (${loc.lat.toFixed(5)},${loc.lng.toFixed(5)})` : ""
      return `  Day ${i + 1}: ${item.time ? `${item.time} ` : ""}${JSON.stringify(loc?.name || item.title)}${at}${isLodging(item) ? " [where they sleep]" : item.kind === "reservation" ? " [booking]" : " [booked]"}`
    }),
  )
  const bases = baseByDay(trip)
  const baseLines = dates.flatMap((date, i) => {
    const day = trip.days.find((d) => d.date === date)
    const base = day ? bases.get(day.id) : undefined
    if (!base) return []
    const at = base.lat != null && base.lng != null ? ` (${base.lat.toFixed(5)},${base.lng.toFixed(5)})` : ""
    return [`  Day ${i + 1}: ${JSON.stringify(base.name)}${at}`]
  })

  const header = [
    `Trip: ${trip.name}`,
    `Destinations: ${trip.destinations.join(", ")}`,
    `Dates: ${trip.startDate} to ${trip.endDate} (${dates.length} days)`,
    `Days, in order (plan around each weekday's closures): ${dates.map((date, i) => `${i + 1}. ${weekday(date)} ${date}`).join("; ")}`,
    `Timezone: ${trip.timezone}`,
    trip.description ? `Context: ${trip.description}` : undefined,
    prefLines ? `Traveler preferences:\n${prefLines}` : undefined,
    baseLines.length
      ? `Where they sleep (start mornings near it, end evenings within an easy ride of it, and say how to get back when the last stop is far):\n${baseLines.join("\n")}`
      : undefined,
    fixedLines.length
      ? `Already fixed by the traveller. Do NOT output these (they are kept as they are); plan the rest of each day around their time and place:\n${fixedLines.join("\n")}`
      : undefined,
    `Instructions: ${args.prompt?.trim() || DEFAULT_ITINERARY_PROMPT}`,
  ]
    .filter(Boolean)
    .join("\n")
  const latLng = tripLatLngHint(trip) ?? undefined

  let summary: string | undefined
  let appearance: Trip["appearance"] | undefined
  let aiDays: Array<AiDay | undefined> = []

  if (dates.length <= SINGLE_CALL_DAYS) {
    // Short trips: one call, one retry if it comes back thin.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const parsed = salvageItinerary(await llm({ system: GENERATION_SYSTEM, user: header, latLng, effort: "medium" }))
        summary ??= parsed.summary
        appearance ??= parsed.appearance
        aiDays = dates.map((_, i) => fuller(aiDays[i], parsed.days[i]))
        if (aiDays.every(dayLooksDrafted)) break
      } catch (err) {
        if (attempt === 1 && !aiDays.some((day) => day !== undefined)) throw err
        console.warn(`[trips/ai] draft attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } else {
    // Long trips: agree the shape of every day first, then draft a few days
    // at a time in parallel. No single answer is long enough to be cut off,
    // and one bad part costs three days, not the trip.
    const outline = await draftOutline({ llm, header, dates, latLng })
    summary = outline.summary
    appearance = outline.appearance
    const plan = dates
      .map((date, i) => {
        const day = outline.days[i]
        return `  ${i + 1}. ${weekday(date)} ${date}: ${day?.title ?? "(open)"}${day?.city ? ` · ${day.city}` : ""}${
          day?.neighborhoods?.length ? ` · ${day.neighborhoods.join(", ")}` : ""
        }${day?.focus ? ` — ${day.focus}` : ""}`
      })
      .join("\n")

    const chunks: number[][] = []
    for (let i = 0; i < dates.length; i += CHUNK_DAYS) {
      chunks.push(dates.slice(i, i + CHUNK_DAYS).map((_, k) => i + k))
    }
    aiDays = new Array(dates.length).fill(undefined)

    const draftChunk = async (indexes: number[]) => {
      const first = indexes[0]! + 1
      const last = indexes[indexes.length - 1]! + 1
      const user = [
        header,
        `The whole trip, day by day. This is settled; follow it:\n${plan}`,
        `For THIS request draft only day${indexes.length > 1 ? "s" : ""} ${first}${last !== first ? ` to ${last}` : ""}: "days" has exactly ${indexes.length} entr${indexes.length === 1 ? "y" : "ies"}, in that order. The other days are being drafted separately, so stay inside these days' areas and do not use venues that belong to another day's line above.`,
      ].join("\n\n")
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const parsed = salvageItinerary(await llm({ system: GENERATION_SYSTEM, user, latLng, effort: "medium" }))
          indexes.forEach((dayIndex, k) => {
            aiDays[dayIndex] = fuller(aiDays[dayIndex], parsed.days[k])
          })
          if (indexes.every((dayIndex) => dayLooksDrafted(aiDays[dayIndex]))) return
        } catch (err) {
          console.warn(`[trips/ai] days ${first}-${last} attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
    const queue = [...chunks]
    await Promise.all(
      Array.from({ length: Math.min(CHUNK_CONCURRENCY, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await draftChunk(next)
      }),
    )
    if (!aiDays.some((day) => stopCount(day) > 0)) throw new Error("the draft came back empty")
    // A day whose part failed still gets its agreed title and areas.
    aiDays = aiDays.map((day, i) => day ?? { ...outline.days[i], items: [] })
  }

  // Parts drafted apart can pick the same venue: the earlier day keeps it.
  const seen = new Set<string>()
  for (const fixed of fixedByDate.values()) for (const item of fixed) seen.add(placeKey(item.location?.name || item.title))
  const incompleteDays: number[] = []
  const days: TripDay[] = dates.map((date, i) => {
    const aiDay = aiDays[i]
    const fresh = toTripItems(aiDay?.items ?? []).filter((item) => {
      if (item.kind !== "place") return true
      const key = placeKey(item.location?.name || item.title)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (!dayLooksDrafted(aiDay)) incompleteDays.push(i + 1)
    const items = (fixedByDate.get(date) ?? []).reduce((list, item) => insertByTime(list, item), fresh)
    return {
      id: `day-${i + 1}`,
      date,
      title: aiDay?.title,
      emoji: aiDay?.emoji,
      city: aiDay?.city,
      notes: aiDay?.notes,
      neighborhoods: aiDay?.neighborhoods,
      items,
    }
  })

  if (geocode) {
    await fillMissingCoordinates(
      days.flatMap((d) => d.items),
      geocode,
      trip.destinations[0],
    )
  }

  return { summary, appearance, days, incompleteDays }
}

const outlineDaySchema = z.object({
  title: z.string().max(200).optional(),
  emoji: z.string().max(32).optional(),
  city: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  neighborhoods: z.array(z.string().min(1).max(80)).max(12).optional(),
  focus: z.string().max(600).optional(),
})
type OutlineDay = z.infer<typeof outlineDaySchema>

/** The shape of every day (theme, areas, anchors) before any venue is chosen. */
async function draftOutline(args: {
  llm: LlmCall
  header: string
  dates: string[]
  latLng?: { latitude: number; longitude: number }
}): Promise<{ summary?: string; appearance?: Trip["appearance"]; days: OutlineDay[] }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const loose = parseModelJson(
        await args.llm({ system: OUTLINE_SYSTEM, user: args.header, latLng: args.latLng, effort: "low" }),
        z.object({
          summary: z.string().max(2000).optional(),
          appearance: z.unknown().optional(),
          days: z.array(z.unknown()).max(60).default([]),
        }),
      )
      const appearance = aiAppearanceSchema.safeParse(loose.appearance)
      const days = loose.days.map((raw) => {
        const day = outlineDaySchema.safeParse(raw)
        return day.success ? day.data : {}
      })
      if (days.length > 0) return { summary: loose.summary, appearance: appearance.success ? appearance.data : undefined, days }
    } catch (err) {
      console.warn(`[trips/ai] outline attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // No outline is not fatal: the parts still know the dates and the brief.
  return { days: [] }
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

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** A day as the reviewing model sees it: every item with its id, clock,
 *  place and the traveller's own notes, then the computed facts. */
export function describeDay(day: TripDay): string {
  const items = day.items
    .map((i) => {
      const loc = i.location
      const parts = [
        `    - id=${i.id} kind=${i.kind} title=${JSON.stringify(i.title)}`,
        i.time ? `time=${i.time}${i.endTime ? `-${i.endTime}` : ""}` : "time=none",
        i.status !== "none" ? `status=${i.status}` : "",
        loc
          ? `place=${JSON.stringify(loc.name)}${loc.category ? ` [${loc.category}]` : ""}${
              loc.lat != null && loc.lng != null ? ` (${loc.lat.toFixed(5)},${loc.lng.toFixed(5)})` : " (no coordinates)"
            }`
          : "",
        i.notes?.trim() ? `notes=${JSON.stringify(clip(i.notes.trim().replace(/\s+/g, " "), 140))}` : "",
      ]
      return parts.filter(Boolean).join(" ")
    })
    .join("\n")
  const head =
    `  dayId=${day.id} ${weekday(day.date)} ${day.date}` +
    (day.city ? ` city=${day.city}` : "") +
    (day.title ? ` title=${JSON.stringify(day.title)}` : "") +
    (day.neighborhoods?.length ? ` areas=${day.neighborhoods.join(", ")}` : "")
  return `${head}\n${items || "    (no items)"}\n${describeSignals(analyseDay(day))}`
}

function placeKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
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
  const lodgingLines = describeBases(trip, days)
  // One line per other day, so a single-day review knows what the rest of
  // the trip already covers and where it is based.
  const elsewhere =
    scope === "day"
      ? trip.days
          .filter((d) => d.id !== dayId && d.items.some((i) => i.location))
          .map(
            (d) =>
              `  ${d.date}${d.city ? ` (${d.city})` : ""}: ${d.items
                .flatMap((i) => (i.location ? [i.location.name] : []))
                .slice(0, 12)
                .join("; ")}`,
          )
      : []
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
    scope === "day"
      ? `Scope: ONE day, ${dayId}. Every suggestion must be for ${dayId}.`
      : "Scope: the whole trip.",
    args.prompt?.trim()
      ? `Traveler's focus for this review (prioritize this): ${args.prompt.trim()}`
      : undefined,
    lodgingLines ? `Where they sleep, and how each day sits against it:\n${lodgingLines}` : undefined,
    scope === "day" ? "The day under review:" : "Itinerary:",
    ...days.map(describeDay),
    elsewhere.length ? `Already on other days of this trip (do not repeat these venues):\n${elsewhere.join("\n")}` : undefined,
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
    const raw = await llm({
      system: ENHANCEMENT_SYSTEM,
      user,
      latLng: tripLatLngHint(trip, scope === "day" ? dayId : undefined) ?? undefined,
      effort: "medium",
    })
    const parsed = salvageSuggestions(raw)
    run.summary = parsed.summary
    const validDayIds = new Set(days.map((d) => d.id))
    const validItemIds = new Set(days.flatMap((d) => d.items.map((i) => i.id)))
    const tripDayIds = new Set(trip.days.map((d) => d.id))
    // A single-day review can only be about that day: models often omit the
    // day id (or invent one) when the day is empty, which used to drop every
    // suggested stop.
    const scoped = parsed.suggestions.map((s) =>
      scope === "day" && dayId && (!s.dayId || !validDayIds.has(s.dayId)) ? { ...s, dayId } : s,
    )
    // Venues already on the trip (any day) are never re-added, and the model
    // cannot add the same venue twice in one review.
    const taken = new Set(
      trip.days.flatMap((d) => d.items.flatMap((i) => (i.location?.name ? [placeKey(i.location.name)] : []))),
    )
    const isFresh = (name: string | undefined) => {
      const key = name ? placeKey(name) : ""
      if (!key) return true
      if (taken.has(key)) return false
      taken.add(key)
      return true
    }
    run.suggestions = scoped
      .filter((s) => !s.dayId || validDayIds.has(s.dayId))
      .filter((s) => s.kind !== "add" || isFresh(s.proposedItem?.location?.name))
      .filter((s) => s.kind !== "add" || (s.dayId && validDayIds.has(s.dayId) && s.proposedItem))
      .filter((s) => !(s.kind === "edit" || s.kind === "remove") || (s.itemId && validItemIds.has(s.itemId)))
      // Moves and day swaps reach across days, so the target may be any day of the trip.
      .filter((s) => s.kind !== "move" || (s.itemId && validItemIds.has(s.itemId) && s.toDayId && tripDayIds.has(s.toDayId)))
      .filter((s) => s.kind !== "swap_days" || (s.dayId && s.toDayId && s.toDayId !== s.dayId && tripDayIds.has(s.dayId) && tripDayIds.has(s.toDayId)))
      .map(
        (s): EnhancementSuggestion => ({
          id: newId("sug"),
          kind: s.kind,
          dayId: s.dayId,
          itemId: s.itemId,
          toDayId: s.toDayId,
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
    // A shorter walking order needs no model: offer it when the review did
    // not already propose a reorder for that day.
    for (const day of days) {
      if (run.suggestions.some((s) => s.kind === "reorder" && s.dayId === day.id)) continue
      const shorter = shorterRoute(day)
      if (!shorter) continue
      run.suggestions.push({
        id: newId("sug"),
        kind: "reorder",
        dayId: day.id,
        title: "Walk the stops in a shorter order",
        detail: `Visiting them nearest-first cuts the route from ${shorter.beforeKm} km to ${shorter.afterKm} km. Your first stop stays first.`,
        confidence: "high",
        proposedOrder: shorter.order,
      })
    }
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

/** Adds safe to land on the itinerary: real day + a mapped place (or a titled note). */
export function isAddableSuggestion(s: EnhancementSuggestion): boolean {
  if (s.kind !== "add" || !s.dayId || !s.proposedItem) return false
  if (s.proposedItem.kind === "place") {
    const loc = s.proposedItem.location
    return Boolean(
      loc?.name?.trim() &&
      Number.isFinite(loc.lat) &&
      Number.isFinite(loc.lng),
    )
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
          // Timed adds land where the clock says, not at the bottom.
          day.items = insertByTime(day.items, structuredClone(s.proposedItem))
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
      case "move": {
        const target = days.find((d) => d.id === s.toDayId)
        const from = days.find((d) => d.items.some((i) => i.id === s.itemId))
        if (target && from && from.id !== target.id) {
          const item = from.items.find((i) => i.id === s.itemId)!
          from.items = from.items.filter((i) => i.id !== s.itemId)
          const moved = { ...item, ...(s.proposedChanges?.time ? { time: s.proposedChanges.time, endTime: s.proposedChanges.endTime } : {}) }
          target.items = insertByTime(target.items, moved)
          ok = true
        }
        break
      }
      case "swap_days": {
        // The dates (and their weather) stay put; the plans trade places.
        const other = days.find((d) => d.id === s.toDayId)
        if (day && other && day.id !== other.id) {
          const keep = (d: TripDay) => ({ items: d.items, title: d.title, emoji: d.emoji, city: d.city, notes: d.notes, neighborhoods: d.neighborhoods })
          const a = keep(day)
          const b = keep(other)
          Object.assign(day, b)
          Object.assign(other, a)
          ok = true
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
