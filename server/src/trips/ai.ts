import Groq from "groq-sdk"
import { textFromGeminiParts, type GeminiPart } from "../geminiStream"
import {
  delay,
  fetchGeminiWithTransientRetry,
  GEMINI_TOOLS_MAPS,
  GEMINI_TOOLS_SEARCH,
  mapsRetrievalConfig,
  toolsIncludeMaps,
  type GeminiToolList,
} from "../geminiTools"
import { memoLRU } from "../igPlaces/lru"
import { tripLatLngHint } from "./latLngHint"
import { GEMINI_BASE, GEMINI_MODEL, geminiThinking } from "../igPlaces/gemini"
import { haversineMeters } from "../data/koreaPlaces"
import { sameVenue, venueSet } from "./sameVenue"
import { fromModel, redactPrivate } from "./privateText"
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
  finishRun,
  newId,
  nowIso,
  tripDates,
  type CompleteEnhancementRun,
  type ConfidenceLevel,
  type DayWeather,
  type EnhancementOutcome,
  type EnhancementRunBase,
  type EnhancementSuggestion,
  type FailedEnhancementRun,
  type ItineraryItem,
  type ItineraryReservation,
  type Trip,
  type TripDay,
  type TripLocation,
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
  /** The caller's whole budget for this call, across every model and tool
   *  mode it tries. Aborting it rejects the call. */
  signal?: AbortSignal
  /** When that budget runs out (epoch ms), if the caller knows. A model
   *  with a fallback ladder sizes each try from it (see `modeTimeoutMs`). */
  deadlineAt?: number
}) => Promise<string>

/** `signal` is the caller's budget; a geocoder that ignores it still works,
 *  the caller just stops waiting for it. */
export type Geocoder = (
  query: string,
  opts?: { signal?: AbortSignal },
) => Promise<{ lat: number; lng: number; address?: string; placeId?: string } | null>

export type WeatherFetcher = (args: {
  lat: number
  lng: number
  dates: string[]
  signal?: AbortSignal
}) => Promise<Array<{ date: string; highC: number; lowC: number; precipitationChance: number }>>

const GROQ_MODEL = "openai/gpt-oss-120b"

/** Groq on-demand TPM for gpt-oss-120b. The API reserves prompt + max_tokens. */
export const GROQ_TPM_LIMIT = 8000
const GROQ_TPM_RESERVE = 200
/** Default completion budget. 8192 alone exceeds Groq's 8k on-demand TPM. */
export const GROQ_DEFAULT_MAX_TOKENS = 2048

const TRAVELER_REVIEW_ERROR = "The review did not finish. Try again in a moment."
const TRAVELER_PARSE_ERROR = "The review came back in a form we could not use. Try again."
const TRAVELER_TIMEOUT_ERROR = "The review took too long to finish. Try again in a moment."
const TRAVELER_BUSY_ERROR = "The AI is busy right now. Try again in a moment."
const TRAVELER_BLOCKED_ERROR = "The AI declined to review this plan as written. Nothing in your itinerary changed."
const TRAVELER_TOO_LONG_ERROR = "This plan is too long for the AI to review in one go. Review one day at a time instead."

/** Our own refusal when a prompt cannot fit Groq's on-demand budget. */
const GROQ_TOO_LONG = "groq prompt exceeds on-demand token budget"

// ── Cancellation ─────────────────────────────────────────────────────────

/** The caller's signal ended an LLM call. Named like the platform's abort
 *  error so `name === "AbortError"` checks see it; the message is safe to
 *  show a traveller, and the signal's reason is kept as `cause`. */
export class LlmAbortError extends Error {
  override name = "AbortError"
  constructor(reason?: unknown) {
    super("The AI took too long to answer.", { cause: reason })
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new LlmAbortError(signal.reason)
}

/** One request's own timeout, inside the caller's whole budget when there is one. */
/** The most one Gemini request may take, however much budget is left. */
export const GEMINI_MAX_REQUEST_MS = 210_000
/** What the first mode leaves for a quicker fallback when a deadline is known. */
export const GEMINI_FALLBACK_RESERVE_MS = 30_000

/** How long one try on the ladder may take. With no deadline, the fixed
 *  per-request timeout. With one, the first mode gets all of it but a short
 *  reserve: a Maps-grounded review often takes 100 to 150 s, and a fixed
 *  150 s cut it off just short and left the fallback too little time to
 *  answer. Later modes get whatever is left. */
export function modeTimeoutMs(args: { first: boolean; perRequestMs: number; deadlineAt?: number; now?: number }): number {
  if (args.deadlineAt === undefined) return args.perRequestMs
  const left = args.deadlineAt - (args.now ?? Date.now())
  const budget = args.first ? left - GEMINI_FALLBACK_RESERVE_MS : left
  return Math.max(1_000, Math.min(budget, GEMINI_MAX_REQUEST_MS))
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

// Maps and Search grounding cannot share a request on current models
// (400 "cannot be combined"), so the ladder starts at Maps alone.
const GEMINI_MODES = ["maps", "search", "json"] as const
type GeminiMode = (typeof GEMINI_MODES)[number]

function toolsForGeminiMode(mode: GeminiMode): GeminiToolList | undefined {
  if (mode === "maps") return GEMINI_TOOLS_MAPS
  if (mode === "search") return GEMINI_TOOLS_SEARCH
  return undefined
}

const rawMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

function isGeminiQuotaError(err: unknown): boolean {
  return /\bgemini 429\b/.test(rawMessage(err))
}

/** The prompt itself was refused by the safety filter: no tool mode, model
 *  or retry will answer it differently. */
function isGeminiBlocked(err: unknown): boolean {
  return /\bgemini blocked:/.test(rawMessage(err))
}

/** Failures another attempt with the same trip cannot fix. */
function isTerminalLlmError(err: unknown): boolean {
  return isGeminiBlocked(err) || rawMessage(err) === GROQ_TOO_LONG
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
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
  if (err instanceof ReviewAttemptError) return err.message
  if (isAbortError(err)) return TRAVELER_TIMEOUT_ERROR
  const raw = rawMessage(err)
  if (raw === "day not found") return raw
  if (isGeminiBlocked(err)) return TRAVELER_BLOCKED_ERROR
  if (raw === GROQ_TOO_LONG) return TRAVELER_TOO_LONG_ERROR
  if (isGeminiQuotaError(err)) return TRAVELER_BUSY_ERROR
  if (/no JSON object found|failed validation/i.test(raw)) return TRAVELER_PARSE_ERROR
  return TRAVELER_REVIEW_ERROR
}

// ── Review attempt failures ──────────────────────────────────────────────
//
// A review runs as attempts in a durable queue. An attempt that could go
// differently next time (a model or network failure, a quota, a timeout, a
// reply we could not read) throws a ReviewAttemptError, and the queue
// retries it. One that cannot (the day is gone, the prompt is refused)
// returns a failed run instead.

/** Why a review attempt stopped. The message is what the traveller sees;
 *  the provider's own error is kept as `cause` for the log. */
export class ReviewAttemptError extends Error {
  override name = "ReviewAttemptError"
  readonly retryable: boolean
  constructor(message: string, opts: { retryable: boolean; cause?: unknown }) {
    super(message, { cause: opts.cause })
    this.retryable = opts.retryable
  }
}

/** Whether another attempt at the review could succeed. Anything not known
 *  to be final counts as retryable: the queue caps attempts, so a wrong
 *  guess costs a retry, while the opposite one loses the review to a blip. */
export function isRetryableReviewError(err: unknown): boolean {
  if (err instanceof ReviewAttemptError) return err.retryable
  return !isTerminalLlmError(err)
}

function toReviewAttemptError(err: unknown, signal: AbortSignal | undefined): ReviewAttemptError {
  if (err instanceof ReviewAttemptError) return err
  // The deadline decides, whatever the error looks like by the time it got here.
  if (signal?.aborted) return new ReviewAttemptError(TRAVELER_TIMEOUT_ERROR, { retryable: true, cause: err })
  return new ReviewAttemptError(travelerFacingLlmError(err), { retryable: isRetryableReviewError(err), cause: err })
}

export function createGroqLlm(apiKey: string): LlmCall {
  const groq = new Groq({ apiKey })
  return async ({ system, user, maxTokens, signal }) => {
    throwIfAborted(signal)
    const max_tokens = groqSafeMaxTokens({ system, user, maxTokens })
    if (max_tokens < 256) {
      throw new Error(GROQ_TOO_LONG)
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
    let completion: Awaited<ReturnType<typeof groq.chat.completions.create>>
    try {
      completion = (await groq.chat.completions.create(
        createParams as unknown as Parameters<typeof groq.chat.completions.create>[0] & { stream?: false },
        { signal },
      )) as Awaited<ReturnType<typeof groq.chat.completions.create>>
    } catch (err) {
      if (signal?.aborted) throw new LlmAbortError(signal.reason)
      throw err
    }
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
 * does not fix quota), as is a prompt the safety filter blocked. Empty /
 * 400 responses and a request's own timeout step down the ladder.
 *
 * `signal` bounds the whole call: each request times out on its own clock
 * inside it, and once it aborts no further mode is tried.
 */
export function createGeminiLlm(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  opts?: { model?: string },
): LlmCall {
  const model = opts?.model ?? GEMINI_MODEL
  return async ({ system, user, maxTokens, latLng, effort, signal, deadlineAt }) => {
    const perRequestMs = effort && effort !== "low" ? 150_000 : 90_000
    const toolConfig = mapsRetrievalConfig(latLng)
    const run = async (mode: GeminiMode, first: boolean): Promise<string> => {
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
            signal: requestSignal(signal, modeTimeoutMs({ first, perRequestMs, deadlineAt })),
          },
          fetchImpl,
        )

      let res = await requestOnce()
      if (res.status === 429) {
        await res.text().catch(() => {})
        const raw = Number(res.headers.get("retry-after"))
        const waitMs = Number.isFinite(raw) && raw > 0 ? Math.min(raw * 1000, 4_000) : 200
        await delay(waitMs, signal)
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

    throwIfAborted(signal)
    let lastErr: Error | null = null
    for (const [i, mode] of GEMINI_MODES.entries()) {
      try {
        return await run(mode, i === 0)
      } catch (err) {
        // The caller's budget is spent (whatever the error says by now):
        // no further mode could answer in time.
        if (signal?.aborted) throw new LlmAbortError(signal.reason)
        lastErr = err instanceof Error ? err : new Error(String(err))
        if (isGeminiQuotaError(lastErr) || isGeminiBlocked(lastErr)) {
          console.warn(`[trips/ai] Gemini ${mode} failed (${lastErr.message}); not stepping down tools`)
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
      // The caller stopped the call: a second model would run past its budget.
      if (opts.signal?.aborted) throw err
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

/** Geocoding a venue name is deterministic over days, and a draft or review
 *  asks for the same names again and again: remember answers in process.
 *  A miss is remembered briefly so a flaky lookup is retried soon. */
function cachedGeocoder(lookup: Geocoder): Geocoder {
  return memoLRU(lookup, {
    keyFn: (query) => query.trim().toLowerCase(),
    max: 2000,
    ttlMs: 7 * 24 * 60 * 60_000,
    nullTtlMs: 5 * 60_000,
  })
}

export function createGoogleGeocoder(apiKey: string): Geocoder {
  return cachedGeocoder(async (query, opts) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
    const res = await fetch(url, { signal: requestSignal(opts?.signal, 8_000) })
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
  })
}

/** Keyless fallback geocoder (Photon / OpenStreetMap). Same contract as the
 *  Google geocoder: null on a miss. Never throws — a failed lookup just
 *  leaves the place without coordinates — except when the caller's signal
 *  stopped it, so an abandoned lookup is not remembered as a miss. */
export function createPhotonGeocoder(fetchImpl: typeof fetch = fetch): Geocoder {
  return cachedGeocoder(async (query, opts) => {
    const q = query.trim()
    if (!q) return null
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`
      const res = await fetchImpl(url, { signal: requestSignal(opts?.signal, 5_000) })
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
    } catch (err) {
      if (opts?.signal?.aborted) throw err
      return null
    }
  })
}

/** Open-Meteo daily forecast — free, no API key. Returns [] outside the
 *  ~16-day forecast window or on any failure (weather is best-effort). */
export const fetchOpenMeteoWeather: WeatherFetcher = async ({ lat, lng, dates, signal }) => {
  try {
    const start = dates[0]
    const end = dates[dates.length - 1]
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${start}&end_date=${end}`
    const res = await fetch(url, { signal: requestSignal(signal, 8_000) })
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

/** A review suggestion as the model writes it: the shared schema plus the
 *  wishlist link. An add that schedules a saved place may leave out the
 *  stop's title, since the saved place supplies it; any other add must
 *  name its stop. */
const reviewSuggestionSchema = aiSuggestionSchema
  .extend({
    fromIdeaId: z.string().min(1).max(64).optional(),
    proposedItem: aiItemSchema.partial({ title: true }).optional(),
  })
  .refine((s) => s.fromIdeaId || !s.proposedItem || s.proposedItem.title, {
    message: "Required",
    path: ["proposedItem", "title"],
  })
type AiSuggestion = z.infer<typeof reviewSuggestionSchema>

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
  // The wishlist id sometimes lands inside the stop, or arrives as null or
  // "": a bad link must not cost the whole suggestion.
  const nested = s.proposedItem && typeof s.proposedItem === "object" ? (s.proposedItem as Record<string, unknown>).fromIdeaId : undefined
  const ideaId = typeof s.fromIdeaId === "string" && s.fromIdeaId.trim() ? s.fromIdeaId : nested
  if (typeof ideaId === "string" && ideaId.trim()) s.fromIdeaId = ideaId.trim()
  else delete s.fromIdeaId
  if (s.proposedItem != null) s.proposedItem = normalizeAiItem(s.proposedItem)
  if (s.proposedChanges != null) s.proposedChanges = normalizeAiItem(s.proposedChanges)
  // A wishlist add needs nothing from the model but the link: the saved
  // place fills every blank. So a null, an empty string or a location with
  // no name is a gap to fill, not a malformed stop.
  if (s.fromIdeaId) {
    if (s.proposedItem === null) delete s.proposedItem
    else if (s.proposedItem && typeof s.proposedItem === "object" && !Array.isArray(s.proposedItem)) {
      s.proposedItem = withoutBlanks(s.proposedItem as Record<string, unknown>)
    }
  }
  return s
}

function withoutBlanks(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) {
    if (value == null || (typeof value === "string" && !value.trim())) continue
    out[key] = value
  }
  const loc = out.location
  const named = loc && typeof loc === "object" && typeof (loc as { name?: unknown }).name === "string" && (loc as { name: string }).name.trim()
  if (!named) delete out.location
  return out
}

export function salvageSuggestions(raw: string): {
  summary?: string
  outcome?: EnhancementOutcome
  outcomeReason?: string
  suggestions: AiSuggestion[]
  /** Suggestions the model sent that failed validation. */
  dropped: number
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
    const r = reviewSuggestionSchema.safeParse(normalizeSuggestion(rawSug))
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
    dropped,
  }
}

/**
 * Whether a parsed review says anything we can act on or explain. It does
 * not when nothing survived and either the model sent suggestions that all
 * failed validation (its answer was lost, not empty), or it sent no
 * summary and no outcome either (an empty object). Another attempt can
 * fix both; a review that genuinely changes nothing still says so.
 */
export function reviewReplyIsUsable(parsed: ReturnType<typeof salvageSuggestions>): boolean {
  if (parsed.suggestions.length > 0) return true
  if (parsed.dropped > 0) return false
  return Boolean(parsed.summary?.trim() || parsed.outcome || parsed.outcomeReason?.trim())
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
    notes: fromModel(item.notes),
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
    trip.description ? `Context: ${redactPrivate(trip.description)}` : undefined,
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
  const seen = venueSet([...fixedByDate.values()].flat())
  const incompleteDays: number[] = []
  const days: TripDay[] = dates.map((date, i) => {
    const aiDay = aiDays[i]
    const fresh = toTripItems(aiDay?.items ?? []).filter((item) => {
      if (item.kind !== "place") return true
      if (seen.has(item)) return false
      seen.add(item)
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
      notes: fromModel(aiDay?.notes),
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
 *  Parallel batches keep long trips under the client/proxy timeout; the
 *  pass stops at its own 12 s budget or when `signal` aborts, whichever
 *  comes first, and a lookup that answers after that changes nothing. */
export async function fillMissingCoordinates(
  items: ItineraryItem[],
  geocode: Geocoder,
  destination?: string,
  signal?: AbortSignal,
): Promise<void> {
  const pending = items
    .filter((i) => i.location && (i.location.lat == null || i.location.lng == null))
    .slice(0, 40)
  if (pending.length === 0) return
  const CONCURRENCY = 6
  const stop = requestSignal(signal, 12_000)
  const stopped = new Promise<void>((resolve) => {
    if (stop.aborted) resolve()
    else stop.addEventListener("abort", () => resolve(), { once: true })
  })
  for (let i = 0; i < pending.length && !stop.aborted; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)
    await Promise.race([
      Promise.all(
        batch.map(async (item) => {
          const loc = item.location!
          try {
            const hit = await geocode([loc.name, loc.address, destination].filter(Boolean).join(", "), { signal: stop })
            if (hit && !stop.aborted) {
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
      stopped,
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
/** The traveller's own words on one line, clipped and quoted. */
/** What the traveller wrote, on one line, without booking codes or contact details. */
const quote = (text: string, max: number) => JSON.stringify(clip(redactPrivate(text).trim().replace(/\s+/g, " "), max))
const hasPoint = (loc: TripLocation | undefined): loc is TripLocation & { lat: number; lng: number } =>
  loc?.lat != null && loc.lng != null
const fmtPoint = (loc: TripLocation) => (hasPoint(loc) ? `(${loc.lat.toFixed(5)},${loc.lng.toFixed(5)})` : "(no coordinates)")
const fmtMoney = (amount: number, currency: string) => `${Math.round(amount * 100) / 100} ${currency}`

/** Sums by currency, largest first ("1200 KRW + 40 USD"). The server has no
 *  exchange rates, so different currencies are never added together.
 *  (chat.ts keeps its own copy for the concierge.) */
function fmtTotals(rows: readonly { amount: number; currency: string }[]): string {
  const sums = new Map<string, number>()
  for (const r of rows) sums.set(r.currency, (sums.get(r.currency) ?? 0) + r.amount)
  return [...sums.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([currency, amount]) => fmtMoney(amount, currency))
    .join(" + ")
}

/** What the model needs of a booking to plan around it. Confirmation codes,
 *  contacts, seats and links stay out: they change nothing in a plan. */
function describeBooking(r: ItineraryReservation): string {
  const carrier = [r.provider && clip(r.provider, 60), r.number].filter(Boolean).join(" ")
  return [
    r.type,
    r.status,
    carrier,
    r.from || r.to ? `${clip(r.from ?? "?", 60)} → ${clip(r.to ?? "?", 60)}` : "",
    r.endDate ? `until ${r.endDate}${r.endTimezone ? ` (${r.endTimezone})` : ""}` : "",
    r.terminal ? `terminal ${r.terminal}` : "",
  ]
    .filter(Boolean)
    .join(", ")
}

/** A place line: the name only when it differs from the title it follows. */
function describePlace(loc: TripLocation, title: string): string {
  const name = loc.name === title ? "(as title)" : JSON.stringify(loc.name)
  return `place=${name}${loc.category ? ` [${loc.category}]` : ""} ${fmtPoint(loc)}`
}

function describeItem(i: ItineraryItem): string {
  return [
    // FIXED: a booking, a booked or finished stop, or where they sleep.
    `    - id=${i.id} kind=${i.kind}${isFixed(i) ? " FIXED" : ""} title=${JSON.stringify(i.title)}`,
    i.time ? `time=${i.time}${i.endTime ? `-${i.endTime}` : ""}` : "time=none",
    i.status !== "none" ? `status=${i.status}` : "",
    i.highlight ? "loved" : "",
    i.reservation ? `booking=${JSON.stringify(describeBooking(i.reservation))}` : "",
    i.location ? describePlace(i.location, i.title) : "",
    i.cost ? `cost=${fmtMoney(i.cost.amount, i.cost.currency)}` : "",
    i.notes?.trim() ? `notes=${quote(i.notes, 140)}` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

const MAX_CALLOUTS = 4

/** A day as the reviewing model sees it: what the traveller wrote about it,
 *  every item with its id, clock, place, booking and cost, then the
 *  computed facts. The day's own time zone is named only when it differs
 *  from the trip's; its saved weather only when no live forecast covers it. */
export function describeDay(day: TripDay, opts: { tripTimezone?: string; liveWeather?: boolean } = {}): string {
  const head =
    `  dayId=${day.id} ${weekday(day.date)} ${day.date}` +
    (day.city ? ` city=${day.city}` : "") +
    (day.title ? ` title=${JSON.stringify(day.title)}` : "") +
    (day.neighborhoods?.length ? ` areas=${day.neighborhoods.join(", ")}` : "") +
    (day.timezone && day.timezone !== opts.tripTimezone ? ` timezone=${day.timezone}` : "")
  const about = [
    day.notes?.trim() ? `    theme: ${quote(day.notes, 200)}` : "",
    ...(day.callouts ?? [])
      .filter((c) => c.body.trim())
      .slice(0, MAX_CALLOUTS)
      .map((c) => `    callout (${c.tone}): ${quote(c.body, 160)}`),
    day.weather && !opts.liveWeather
      ? `    saved weather: ${clip(day.weather.condition, 40)}, ${day.weather.lowC}–${day.weather.highC}°C`
      : "",
    day.journal?.trim() ? `    journal: ${quote(day.journal, 200)}` : "",
  ].filter(Boolean)
  const items = day.items.map(describeItem).join("\n")
  return [head, ...about, items || "    (no items)", describeSignals(analyseDay(day))].join("\n")
}

const MAX_PARTY_NAMES = 12
const MAX_OPEN_TODOS = 8

/** Planned stop costs (on days only, as the Budget tab counts them) and
 *  logged spend, against the budget when there is one. */
function describeMoney(trip: Trip): string | undefined {
  const costs = trip.days.flatMap((d) => d.items.flatMap((i) => (i.cost ? [i.cost] : [])))
  const expenses = trip.expenses ?? []
  const budget = trip.budget
  const parts = [
    budget
      ? budget.total !== undefined
        ? `budget ${fmtMoney(budget.total, budget.currency)} for the whole trip`
        : `budget kept in ${budget.currency}, no limit set`
      : "",
    costs.length ? `planned stop costs ${fmtTotals(costs)} over ${costs.length} stop${costs.length === 1 ? "" : "s"}` : "",
    expenses.length ? `spent so far ${fmtTotals(expenses)}` : "",
  ].filter(Boolean)
  return parts.length ? parts.join("; ") : undefined
}

/** The trip's own context: what it is for, who is going, the money and the
 *  open to-dos. The model treats it as the traveller's preferences. */
function describeTripContext(trip: Trip): string[] {
  const lines: string[] = []
  if (trip.description?.trim()) lines.push(`  Description: ${quote(trip.description, 600)}`)
  const tags = trip.tags.filter((tag) => tag.trim())
  if (tags.length) lines.push(`  Tags: ${tags.map((tag) => clip(tag.trim(), 40)).join(", ")}`)
  const party = (trip.party ?? []).filter((p) => p.name.trim())
  if (party.length) {
    const names = party.slice(0, MAX_PARTY_NAMES).map((p) => clip(p.name.trim(), 40))
    const more = party.length - names.length
    lines.push(
      `  Travelling: ${party.length} ${party.length === 1 ? "person" : "people"} (${names.join(", ")}${more > 0 ? `, +${more} more` : ""})`,
    )
  }
  const money = describeMoney(trip)
  if (money) lines.push(`  Money: ${money}`)
  // To-dos only: packing and documents change nothing in a day's plan.
  const todos = (trip.checklist ?? []).filter((c) => c.group === "todo" && !c.done && c.text.trim())
  if (todos.length) {
    const shown = todos.slice(0, MAX_OPEN_TODOS).map((c) => clip(redactPrivate(c.text).trim(), 80))
    const more = todos.length - shown.length
    lines.push(`  Open to-dos: ${shown.join("; ")}${more > 0 ? ` (+${more} more)` : ""}`)
  }
  return lines.length ? ["About this trip (the traveller's preferences):", ...lines] : []
}

const MAX_WISHLIST = 40

/** Saved places that are not on any day yet, with the id the model echoes
 *  in `fromIdeaId`. With `near` (a single-day review), the places closest
 *  to that day come first and say how far they are. */
function describeWishlist(trip: Trip, near?: { lat: number; lng: number }): string | undefined {
  const ideas = trip.ideas ?? []
  if (ideas.length === 0) return undefined
  const onDays = venueSet(trip.days.flatMap((d) => d.items))
  const open = ideas.filter((idea) => !onDays.has(idea))
  const scheduled = ideas.length - open.length
  if (open.length === 0) return `Wishlist: all ${ideas.length} saved place${ideas.length === 1 ? " is" : "s are"} already on a day.`
  const km = (idea: ItineraryItem) =>
    near && hasPoint(idea.location) ? haversineMeters(near, idea.location) / 1000 : Number.POSITIVE_INFINITY
  const ordered = near ? [...open].sort((a, b) => km(a) - km(b)) : open
  const shown = ordered.slice(0, MAX_WISHLIST)
  const lines = shown.map((idea) => {
    const loc = idea.location
    const away = km(idea)
    return [
      `  - ideaId=${idea.id}${idea.kind === "place" ? "" : ` kind=${idea.kind}`} title=${JSON.stringify(idea.title)}`,
      loc ? describePlace(loc, idea.title) : "",
      loc && !hasPoint(loc) && loc.address?.trim() ? `address=${quote(loc.address, 80)}` : "",
      Number.isFinite(away) ? `${Math.round(away * 10) / 10} km from this day's stops` : "",
      idea.cost ? `cost=${fmtMoney(idea.cost.amount, idea.cost.currency)}` : "",
      idea.notes?.trim() ? `notes=${quote(idea.notes, 120)}` : "",
    ]
      .filter(Boolean)
      .join(" ")
  })
  const left = [
    open.length > shown.length ? `${open.length - shown.length} more not shown` : "",
    scheduled > 0 ? `${scheduled} already on a day, not shown` : "",
  ].filter(Boolean)
  return [
    `Wishlist: places the traveller saved but has not put on any day. Each ideaId is a wishlist id: schedule one with an "add" whose "fromIdeaId" is that id.`,
    ...lines,
    ...(left.length ? [`  (${left.join("; ")})`] : []),
  ].join("\n")
}

/** Where a single-day review is centred: the middle of its located stops,
 *  or where the traveller sleeps that night when none are located. */
function dayCentre(trip: Trip, day: TripDay): { lat: number; lng: number } | undefined {
  const points = day.items.flatMap((i) => (hasPoint(i.location) ? [i.location] : []))
  if (points.length > 0) {
    return {
      lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
      lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
    }
  }
  const base = baseByDay(trip).get(day.id)
  return base?.lat != null && base.lng != null ? { lat: base.lat, lng: base.lng } : undefined
}

/** The live forecast for the reviewed days, read at their middle stop: the
 *  prompt's weather lines and `run.weatherByDate`. Best-effort: a forecast
 *  that fails reads as unavailable, never as a failed review. */
async function reviewForecast(
  days: readonly TripDay[],
  fetchWeather: WeatherFetcher | undefined,
  signal: AbortSignal | undefined,
): Promise<{ lines: string; byDate?: Record<string, DayWeather> }> {
  const coords = days.flatMap((d) => d.items).flatMap((i) => (hasPoint(i.location) ? [i.location] : []))
  if (coords.length === 0 || !fetchWeather) return { lines: "unavailable" }
  const mid = coords[Math.floor(coords.length / 2)]!
  let forecast: Awaited<ReturnType<WeatherFetcher>>
  try {
    forecast = await fetchWeather({ lat: mid.lat, lng: mid.lng, dates: days.map((d) => d.date), signal })
  } catch (err) {
    if (signal?.aborted) throw err
    console.warn(`[trips/ai] review forecast failed: ${rawMessage(err)}`)
    return { lines: "unavailable" }
  }
  if (forecast.length === 0) return { lines: "unavailable" }
  return {
    // Persisted onto day.weather with the run, so trip pages' weather chips
    // stay live without a manual edit.
    byDate: Object.fromEntries(
      forecast.map((w) => [
        w.date,
        { highC: Math.round(w.highC), lowC: Math.round(w.lowC), condition: `${w.precipitationChance}% rain` },
      ]),
    ),
    lines: forecast.map((w) => `${w.date}: ${w.lowC}–${w.highC}°C, ${w.precipitationChance}% rain chance`).join("\n"),
  }
}

/** Everything the reviewing model is told about the trip, for either scope. */
function reviewPrompt(args: {
  trip: Trip
  scope: "day" | "trip"
  dayId?: string
  days: readonly TripDay[]
  focus?: string
  weather: { lines: string; byDate?: Record<string, DayWeather> }
}): string {
  const { trip, scope, dayId, days } = args
  const legs = computeTravelLegs([...days])
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
  const reviewed = scope === "day" ? days[0] : undefined
  return [
    `Trip: ${trip.name} (${trip.destinations.join(", ")}), ${trip.startDate} to ${trip.endDate}, timezone ${trip.timezone}.`,
    ...describeTripContext(trip),
    scope === "day" ? `Scope: ONE day, ${dayId}. Every suggestion must be for ${dayId}.` : "Scope: the whole trip.",
    args.focus?.trim() ? `Traveler's focus for this review (prioritize this): ${args.focus.trim()}` : undefined,
    lodgingLines ? `Where they sleep, and how each day sits against it:\n${lodgingLines}` : undefined,
    scope === "day" ? "The day under review:" : "Itinerary:",
    ...days.map((day) =>
      describeDay(day, { tripTimezone: trip.timezone, liveWeather: Boolean(args.weather.byDate?.[day.date]) }),
    ),
    elsewhere.length ? `Already on other days of this trip (do not repeat these venues):\n${elsewhere.join("\n")}` : undefined,
    describeWishlist(trip, reviewed ? dayCentre(trip, reviewed) : undefined),
    `Computed distances between consecutive located stops:`,
    legs.length
      ? legs.map((l) => `  ${l.dayId}: ${l.from} → ${l.to}: ${l.distanceKm} km`).join("\n")
      : "  (none — items lack coordinates)",
    `Weather forecast near the itinerary:`,
    args.weather.lines,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")
}

type AiProposedItem = NonNullable<AiSuggestion["proposedItem"]>

/** A stop the model proposed, as an AI-made item. */
function proposedStop(p: AiProposedItem & { title: string }, confidence: ConfidenceLevel): ItineraryItem {
  return {
    id: newId("it"),
    kind: p.kind ?? "place",
    title: p.title,
    time: p.time,
    endTime: p.endTime,
    notes: fromModel(p.notes),
    status: p.status ?? "needs_review",
    location: p.location ? { ...p.location, source: "ai", confidence } : undefined,
    createdBy: "ai",
  }
}

/** The traveller's saved pin stands; the model only fills what it lacks. */
function savedLocation(
  saved: TripLocation | undefined,
  proposed: AiProposedItem["location"],
  confidence: ConfidenceLevel,
): TripLocation | undefined {
  if (!saved) return proposed ? { ...proposed, source: "ai", confidence } : undefined
  if (hasPoint(saved)) {
    return { ...saved, address: saved.address ?? proposed?.address, category: saved.category ?? proposed?.category }
  }
  const point = proposed?.lat != null && proposed.lng != null ? { lat: proposed.lat, lng: proposed.lng, confidence } : {}
  return { ...saved, address: saved.address ?? proposed?.address, category: saved.category ?? proposed?.category, ...point }
}

/**
 * A wishlist idea as a stop on a day: the place as the traveller saved it
 * (title, pin, cost, links, booking), at the model's time, with the
 * model's note where it wrote one. Mirrors the client's `ideaToDay`, which
 * moves the idea itself, id included, so "already scheduled" is the same
 * test on both sides; `idTaken` gives it a fresh id when a day item
 * already has that one.
 */
function scheduledIdea(
  idea: ItineraryItem,
  proposed: AiProposedItem | undefined,
  confidence: ConfidenceLevel,
  idTaken: boolean,
): ItineraryItem {
  return {
    id: idTaken ? newId("it") : idea.id,
    kind: idea.kind,
    title: idea.title.trim() || proposed?.title || "Saved place",
    time: proposed?.time,
    endTime: proposed?.endTime,
    notes: fromModel(proposed?.notes)?.trim() ? proposed!.notes : idea.notes,
    links: idea.links ? [...idea.links] : undefined,
    // A booked idea stays booked; otherwise it is an AI-placed stop like any other.
    status: idea.status !== "none" ? idea.status : (proposed?.status ?? "needs_review"),
    location: savedLocation(idea.location, proposed?.location, confidence),
    reservation: idea.reservation ? { ...idea.reservation } : undefined,
    cost: idea.cost ? { ...idea.cost } : undefined,
    createdBy: "ai",
  }
}

/**
 * The model's suggestions, kept only where they name real days and items.
 * Every add is checked against the trip and the wishlist in one pass, in
 * the model's order: an add of a saved place schedules that idea (by its
 * `fromIdeaId`, or by name when the model forgot the link), filled in from
 * it and used once; and no venue already on the trip, or added earlier in
 * this review, is added again.
 */
function acceptedSuggestions(args: {
  trip: Trip
  scope: "day" | "trip"
  dayId?: string
  days: readonly TripDay[]
  suggestions: readonly AiSuggestion[]
}): EnhancementSuggestion[] {
  const { trip, scope, dayId, days } = args
  const validDayIds = new Set(days.map((d) => d.id))
  const validItemIds = new Set(days.flatMap((d) => d.items.map((i) => i.id)))
  const tripDayIds = new Set(trip.days.map((d) => d.id))
  const tripItemIds = new Set(trip.days.flatMap((d) => d.items.map((i) => i.id)))
  const taken = venueSet(trip.days.flatMap((d) => d.items))
  const ideas = trip.ideas ?? []
  const used = new Set<string>()
  const freeIdea = (id: string | undefined) => (id && !used.has(id) ? ideas.find((idea) => idea.id === id) : undefined)
  const ideaNamed = (p: AiProposedItem) => ideas.find((idea) => !used.has(idea.id) && sameVenue(idea, p))

  const base = (s: AiSuggestion): EnhancementSuggestion => ({
    id: newId("sug"),
    kind: s.kind,
    dayId: s.dayId,
    itemId: s.itemId,
    toDayId: s.toDayId,
    title: s.title,
    detail: s.detail,
    confidence: s.confidence,
    proposedChanges: s.proposedChanges
      ? {
          ...(s.proposedChanges.title != null ? { title: s.proposedChanges.title } : {}),
          ...(s.proposedChanges.time != null ? { time: s.proposedChanges.time } : {}),
          ...(s.proposedChanges.endTime != null ? { endTime: s.proposedChanges.endTime } : {}),
          ...(s.proposedChanges.notes != null && fromModel(s.proposedChanges.notes) !== undefined
            ? { notes: s.proposedChanges.notes }
            : {}),
          ...(s.proposedChanges.status != null ? { status: s.proposedChanges.status } : {}),
          ...(s.proposedChanges.location != null
            ? { location: { ...s.proposedChanges.location, source: "ai" as const, confidence: s.confidence } }
            : {}),
        }
      : undefined,
    proposedOrder: s.proposedOrder,
  })

  const add = (s: AiSuggestion): EnhancementSuggestion | null => {
    if (!s.dayId || !validDayIds.has(s.dayId)) return null
    const p = s.proposedItem
    const idea = freeIdea(s.fromIdeaId) ?? (p ? ideaNamed(p) : undefined)
    const item = idea
      ? scheduledIdea(idea, p, s.confidence, tripItemIds.has(idea.id))
      : p?.title
        ? proposedStop({ ...p, title: p.title }, s.confidence)
        : null
    if (!item) return null
    if (taken.has(item)) return null
    taken.add(item)
    if (idea) used.add(idea.id)
    return { ...base(s), proposedItem: item, ...(idea ? { fromIdeaId: idea.id } : {}) }
  }

  const accepted: EnhancementSuggestion[] = []
  for (const raw of args.suggestions) {
    // A single-day review can only be about that day: models often omit the
    // day id (or invent one) when the day is empty, which used to drop every
    // suggested stop.
    const s = scope === "day" && dayId && (!raw.dayId || !validDayIds.has(raw.dayId)) ? { ...raw, dayId } : raw
    if (s.dayId && !validDayIds.has(s.dayId)) continue
    switch (s.kind) {
      case "add": {
        const kept = add(s)
        if (kept) accepted.push(kept)
        continue
      }
      case "edit":
      case "remove":
        if (!s.itemId || !validItemIds.has(s.itemId)) continue
        break
      // Moves and day swaps reach across days, so the target may be any day of the trip.
      case "move":
        if (!s.itemId || !validItemIds.has(s.itemId) || !s.toDayId || !tripDayIds.has(s.toDayId)) continue
        break
      case "swap_days":
        if (!s.dayId || !s.toDayId || s.toDayId === s.dayId || !tripDayIds.has(s.dayId) || !tripDayIds.has(s.toDayId)) continue
        break
    }
    accepted.push(base(s))
  }
  return accepted
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
  /** The attempt's deadline. Aborting it stops the review. */
  signal?: AbortSignal
  /** When that deadline falls (epoch ms), so the model can size its tries. */
  deadlineAt?: number
}): Promise<CompleteEnhancementRun | FailedEnhancementRun> {
  const { trip, scope, dayId, llm, signal } = args
  const days = scope === "day" ? trip.days.filter((d) => d.id === dayId) : trip.days
  // Filled in as the review goes; `finishRun` stamps the end state once.
  const run: EnhancementRunBase = {
    id: newId("run"),
    tripId: trip.id,
    scope,
    dayId: scope === "day" ? dayId : undefined,
    suggestions: [],
    appliedSuggestionIds: [],
    createdAt: nowIso(),
  }

  if (days.length === 0) {
    return finishRun(run, {
      status: "error",
      error: "day not found",
      outcomeReason: "That day is not on this trip, so nothing was added.",
    })
  }

  // Every await below can outlast the deadline (an injected fake, or a
  // fetcher that swallows its abort), so the signal is checked after each.
  try {
    throwIfAborted(signal)
    const weather = await reviewForecast(days, args.fetchWeather, signal)
    throwIfAborted(signal)
    if (weather.byDate) run.weatherByDate = weather.byDate

    const raw = await llm({
      system: ENHANCEMENT_SYSTEM,
      user: reviewPrompt({ trip, scope, dayId, days, focus: args.prompt, weather }),
      latLng: tripLatLngHint(trip, scope === "day" ? dayId : undefined) ?? undefined,
      effort: "medium",
      signal,
      deadlineAt: args.deadlineAt,
    })
    throwIfAborted(signal)
    const parsed = salvageSuggestions(raw)
    if (!reviewReplyIsUsable(parsed)) {
      throw new ReviewAttemptError(TRAVELER_PARSE_ERROR, {
        retryable: true,
        cause: new Error(`review reply had nothing usable (${parsed.dropped} malformed suggestion(s))`),
      })
    }
    run.summary = parsed.summary
    run.suggestions = acceptedSuggestions({ trip, scope, dayId, days, suggestions: parsed.suggestions })
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
        signal,
      )
      throwIfAborted(signal)
    }
    const resolved = resolveEnhancementOutcome({
      suggestions: run.suggestions,
      summary: parsed.summary,
      modelOutcome: parsed.outcome,
      modelReason: parsed.outcomeReason,
      // The adds are auto-applied next; stamp the outcome the traveler will see.
      appliedAddCount: addableSuggestionIds(run).length,
    })
    return finishRun(run, { status: "complete", ...resolved })
  } catch (err) {
    const failure = toReviewAttemptError(err, signal)
    // A stopped attempt says why (the worker's deadline, a lost lease, a
    // shutdown handing it back), not what the cut-off request looked like.
    const why = rawMessage(signal?.aborted ? signal.reason : (failure.cause ?? err))
    console.warn(`[trips/ai] review attempt failed (${failure.retryable ? "retryable" : "final"}): ${why}`)
    if (failure.retryable) throw failure
    return finishRun(run, { status: "error", error: failure.message })
  }
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

export function addableSuggestionIds(run: Pick<EnhancementRunBase, "suggestions">): string[] {
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

/** Apply every valid add suggestion and stamp the run with the final outcome.
 *  `run.outcome` / `outcomeReason` are read as the model's view, then
 *  re-resolved against what actually landed. */
export function autoApplyAddSuggestions(
  trip: Trip,
  run: EnhancementRunBase & { outcome?: EnhancementOutcome; outcomeReason?: string },
): { trip: Trip; run: CompleteEnhancementRun; applied: string[]; skipped: string[] } {
  const ids = addableSuggestionIds(run)
  const result = ids.length > 0 ? applySuggestions(trip, run, ids) : { trip, applied: [], skipped: [] }
  const resolved = resolveEnhancementOutcome({
    suggestions: run.suggestions,
    summary: run.summary,
    modelOutcome: run.outcome,
    modelReason: run.outcomeReason,
    appliedAddCount: result.applied.length,
  })
  const nextRun = finishRun(
    { ...run, appliedSuggestionIds: [...run.appliedSuggestionIds, ...result.applied] },
    { status: "complete", ...resolved },
  )
  return { trip: result.trip, run: nextRun, applied: result.applied, skipped: result.skipped }
}

// ── Applying accepted suggestions ────────────────────────────────────────

export function applySuggestions(
  trip: Trip,
  run: Pick<EnhancementRunBase, "suggestions" | "appliedSuggestionIds">,
  suggestionIds: string[],
): {
  trip: Trip
  applied: string[]
  skipped: string[]
} {
  const applied: string[] = []
  const skipped: string[] = []
  const days = trip.days.map((d) => ({ ...d, items: [...d.items] }))
  // Written back only when an add took an idea off it, so a trip without a
  // wishlist does not grow an empty one.
  let ideas = trip.ideas

  for (const id of suggestionIds) {
    const s = run.suggestions.find((x) => x.id === id)
    if (!s || run.appliedSuggestionIds.includes(id)) {
      skipped.push(id)
      continue
    }
    const day = s.dayId ? days.find((d) => d.id === s.dayId) : undefined
    let ok = false
    switch (s.kind) {
      case "add": {
        // The proposed item keeps its id when it lands, so finding it on the
        // trip means this add already happened (a retried or repeated apply,
        // or, for a saved place, the traveller scheduling it meanwhile).
        if (!s.proposedItem || !day || days.some((d) => d.items.some((i) => i.id === s.proposedItem!.id))) break
        let item = structuredClone(s.proposedItem)
        // A venue lands once: not when it is on a day already, under this
        // name or a near one (the traveller may have added it since).
        if (days.some((d) => d.items.some((i) => sameVenue(i, item)))) break
        if (s.fromIdeaId) {
          // It leaves the wishlist in the same change, bringing what the stop
          // lacks (the idea may have been edited since the review). If it is
          // already gone, the stop still lands as proposed.
          const idea = ideas?.find((i) => i.id === s.fromIdeaId)
          if (idea) {
            item = {
              ...item,
              notes: item.notes ?? idea.notes,
              links: item.links ?? (idea.links ? [...idea.links] : undefined),
              cost: item.cost ?? (idea.cost ? { ...idea.cost } : undefined),
            }
            ideas = ideas!.filter((i) => i.id !== s.fromIdeaId)
          }
        }
        // Timed adds land where the clock says, not at the bottom.
        day.items = insertByTime(day.items, item)
        ok = true
        break
      }
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
        // The dates (their weather and journal) stay put; the plans, and the
        // zone that goes with each city, trade places.
        const other = days.find((d) => d.id === s.toDayId)
        if (day && other && day.id !== other.id) {
          const keep = (d: TripDay) => ({ items: d.items, title: d.title, emoji: d.emoji, city: d.city, notes: d.notes, neighborhoods: d.neighborhoods, timezone: d.timezone })
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

  return { trip: { ...trip, days, ...(ideas !== trip.ideas ? { ideas } : {}), updatedAt: nowIso() }, applied, skipped }
}
