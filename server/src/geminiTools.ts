/** Gemini built-in grounding tools + a 400-fallback fetch for chat streams.
 *
 *  Gemini 3.7 Flash supports Search and Maps together. Some combinations
 *  (or account/region flags) still 400 INVALID_ARGUMENT — chat then steps
 *  down Search+Maps → Maps → Search → no tools rather than failing the turn.
 */
import { GEMINI_BASE, GEMINI_MODEL } from "./igPlaces/gemini"

export type GeminiToolList = Array<Record<string, unknown>>

export const GEMINI_TOOLS_SEARCH_AND_MAPS: GeminiToolList = [{ googleSearch: {} }, { googleMaps: {} }]
export const GEMINI_TOOLS_MAPS: GeminiToolList = [{ googleMaps: {} }]
export const GEMINI_TOOLS_SEARCH: GeminiToolList = [{ googleSearch: {} }]

/** Chat tries the richest grounding first, then degrades. */
export const CHAT_TOOL_ATTEMPTS: Array<GeminiToolList | undefined> = [
  GEMINI_TOOLS_SEARCH_AND_MAPS,
  GEMINI_TOOLS_MAPS,
  GEMINI_TOOLS_SEARCH,
  undefined,
]

const TRANSIENT_GEMINI = new Set([500, 502, 503, 504])

export function toolsIncludeMaps(tools: GeminiToolList | undefined): boolean {
  return Boolean(tools?.some((t) => "googleMaps" in t))
}

export function mapsRetrievalConfig(
  latLng: { latitude: number; longitude: number } | null | undefined,
): { retrievalConfig: { latLng: { latitude: number; longitude: number } } } | undefined {
  if (
    !latLng ||
    !Number.isFinite(latLng.latitude) ||
    !Number.isFinite(latLng.longitude) ||
    latLng.latitude < -90 ||
    latLng.latitude > 90 ||
    latLng.longitude < -180 ||
    latLng.longitude > 180
  ) {
    return undefined
  }
  return { retrievalConfig: { latLng } }
}

export function describeGeminiTools(tools: GeminiToolList | undefined): string {
  if (!tools?.length) return "none"
  return tools
    .map((t) => ("googleSearch" in t ? "search" : "googleMaps" in t ? "maps" : "other"))
    .join("+")
}

export async function fetchGeminiWithTransientRetry(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const first = await fetchImpl(url, init)
  if (!TRANSIENT_GEMINI.has(first.status)) return first
  await first.text().catch(() => {})
  await delay(800, init.signal)
  return fetchImpl(url, init)
}

function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export async function fetchGeminiStreamWithToolFallback(args: {
  apiKey: string
  baseBody: Record<string, unknown>
  toolConfig?: Record<string, unknown>
  signal: AbortSignal
  logLabel: string
  fetchImpl?: typeof fetch
}): Promise<Response> {
  const f = args.fetchImpl ?? fetch
  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`

  for (const tools of CHAT_TOOL_ATTEMPTS) {
    const body: Record<string, unknown> = { ...args.baseBody }
    if (tools) body.tools = tools
    if (args.toolConfig && toolsIncludeMaps(tools)) body.toolConfig = args.toolConfig

    const res = await fetchGeminiWithTransientRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
        body: JSON.stringify(body),
        signal: args.signal,
      },
      f,
    )
    if (res.ok) return res
    if (res.status !== 400) return res
    await res.text().catch(() => {})
    console.warn(`[${args.logLabel}] Gemini 400 with tools=${describeGeminiTools(tools)}; retrying`)
  }

  return new Response("gemini tool fallback exhausted", { status: 400 })
}
