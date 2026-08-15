import { Effect } from "effect"
import { bearerHeaders, fetchApi, parseJson, readAuthToken, readErrorMessage } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { HttpStatusError } from "../../effect/errors"

export type BusynessLevel = "quiet" | "moderate" | "busy" | "very_busy"
export type BusynessSource = "gemini-grounded" | "kakao" | "inferred"

export type ExtractedPlace = {
  id: number
  name: string
  name_romanized: string | null
  city: string | null
  category: "restaurant" | "cafe" | "bar" | "shopping" | "activity" | "hotel" | "landmark" | "other"
  confidence: number
  confidence_band: "high" | "medium" | "low"
  is_subject: boolean
  supporting_quote: string | null
  signal_source: "caption" | "transcript" | "ocr" | "location_tag" | "multiple" | null
  vote_count: number
  address: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  rating: number | null
  business_types: string[]
  geocode_source: "apify-tag" | "ig-tag" | "google" | "kakao" | "google+kakao" | "gemini-grounded" | null
  geocode_kakao_id: string | null
  geocode_disagree: boolean
  google_place_id: string | null
  status: "extracted" | "verified" | "rejected"
  created_at: string
  busyness: BusynessLevel | null
  busyness_source: BusynessSource | null
  busyness_confidence: number | null
  days: number[]
  post: {
    id: number
    url: string
    shortcode: string | null
    owner_username: string | null
    caption: string
    fetched_at: string
  }
}

export type ExtractedPlacesResponse = {
  places: ExtractedPlace[]
  total: number
  hasMore: boolean
}

export type PlacesFilter = {
  limit?: number
  offset?: number
  category?: string
  band?: string
  busyness?: BusynessLevel
  q?: string
}

const BASE = "/api/korea/places/from-instagram"

const fetchExtractedPlacesEffect = Effect.fn("PlacesService.fetchExtractedPlaces")(function* (
  getToken: () => Promise<string | null>,
  opts: PlacesFilter = {},
) {
  const token = yield* readAuthToken(getToken)
  const params = new URLSearchParams()
  if (opts.limit != null) params.set("limit", String(opts.limit))
  if (opts.offset != null) params.set("offset", String(opts.offset))
  if (opts.category) params.set("category", opts.category)
  if (opts.band) params.set("band", opts.band)
  if (opts.busyness) params.set("busyness", opts.busyness)
  if (opts.q) params.set("q", opts.q)

  const qs = params.toString()
  const res = yield* fetchApi(`${BASE}/extracted${qs ? `?${qs}` : ""}`, {
    headers: bearerHeaders(token),
    cache: "no-store",
  })
  if (!res.ok) {
    const message = yield* readErrorMessage(res, "error-only")
    return yield* Effect.fail(new HttpStatusError({ status: res.status, message }))
  }
  return yield* parseJson<ExtractedPlacesResponse>(res)
})

export function fetchExtractedPlaces(
  getToken: () => Promise<string | null>,
  opts: PlacesFilter = {},
): Promise<ExtractedPlacesResponse> {
  return runPromise(fetchExtractedPlacesEffect(getToken, opts))
}

const setExtractedPlaceDaysEffect = Effect.fn("PlacesService.setExtractedPlaceDays")(function* (
  getToken: () => Promise<string | null>,
  placeId: number,
  days: number[],
) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`${BASE}/extracted/${placeId}/days`, {
    method: "PUT",
    headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ days }),
  })
  if (!res.ok && res.status !== 204) {
    const message = yield* readErrorMessage(res, "error-only")
    return yield* Effect.fail(new HttpStatusError({ status: res.status, message }))
  }
})

export function setExtractedPlaceDays(
  getToken: () => Promise<string | null>,
  placeId: number,
  days: number[],
): Promise<void> {
  return runPromise(setExtractedPlaceDaysEffect(getToken, placeId, days))
}
