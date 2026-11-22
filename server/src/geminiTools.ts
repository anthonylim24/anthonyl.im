/** Gemini built-in grounding tools, and a fetch that retries one transient 5xx.
 *
 *  Gemini 4 Neon answers 400 to Search and Maps together ("'google_maps'
 *  and 'google_search' cannot be combined"), as does its backup, so callers
 *  send one or the other. (The trips concierge has its own tool loop: see
 *  trips/chat.ts.)
 */
import { fetchGeminiModel } from "./igPlaces/gemini"

export type GeminiToolList = Array<Record<string, unknown>>

export const GEMINI_TOOLS_MAPS: GeminiToolList = [{ googleMaps: {} }]
export const GEMINI_TOOLS_SEARCH: GeminiToolList = [{ googleSearch: {} }]

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

export async function fetchGeminiWithTransientRetry(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const first = await fetchGeminiModel(fetchImpl, url, init)
  if (!TRANSIENT_GEMINI.has(first.status)) return first
  await first.text().catch(() => {})
  await delay(800, init.signal)
  return fetchGeminiModel(fetchImpl, url, init)
}

/** Wait `ms`, or reject with the signal's reason as soon as it aborts. */
export function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
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
