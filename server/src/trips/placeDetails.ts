import { haversineMeters } from "../data/koreaPlaces"
import { sameVenue, type LatLng } from "./conciergeTools"

// What the wishlist's details popover shows for one place: photos, a summary,
// rating, price, hours and links, from Google Places (New) Place Details.
// Fetched when the popover opens, never written to the trip.
//
// The Maps key stays on this server. It travels only in the `X-Goog-Api-Key`
// header (Place Details and photo media both accept it there), so no URL this
// module builds carries it, and photo media is asked for with
// `skipHttpRedirect=true`, which answers a keyless `photoUri` on
// lh3.googleusercontent.com that goes straight into an <img>.

/** Mirrors `PlaceDetails` in `frontend/src/pages/Trips/ideas/contract.ts`. */
export interface PlacePhoto {
  url: string
  width?: number
  height?: number
  author?: { name: string; uri?: string }
}

export interface PlaceDetails {
  placeId?: string
  name: string
  summary?: string
  summarySource?: "google" | "wikipedia"
  summaryUrl?: string
  address?: string
  rating?: number
  ratingCount?: number
  priceLevel?: 0 | 1 | 2 | 3 | 4
  hours?: string[]
  website?: string
  phone?: string
  mapsUrl?: string
  typeLabel?: string
  photos: PlacePhoto[]
}

/** A place's name and where it is: enough to find it when there is no (working) place id. */
export interface NamedPoint {
  name: string
  near: LatLng
}

/** By place id, with the name and point to fall back on when Google no longer knows the id; or by name and point alone. */
export type PlaceDetailsQuery = { placeId: string; fallback?: NamedPoint } | NamedPoint

/** Null: no place we can be sure is the one asked for (a wrong venue is worse than none). */
export type PlaceDetailsLookup = (query: PlaceDetailsQuery, signal?: AbortSignal) => Promise<PlaceDetails | null>

/** Google answered with an error status. Carries the status only: never Google's body, never a URL. */
export class PlaceDetailsUpstreamError extends Error {
  /** `unknownId`: Google said the place id itself is not one it knows. */
  constructor(
    readonly status: number,
    readonly unknownId = false,
  ) {
    super(`place details ${status}`)
    this.name = "PlaceDetailsUpstreamError"
  }
}

/**
 * Google answers an id it does not know (a place that moved or merged, or
 * one that was never Google's) with a 400 "The provided Place ID: … is not
 * valid." A broken field mask is a 400 too, so the body tells them apart.
 */
const UNKNOWN_ID = /place id\b[^"]*\bis not valid/i

/**
 * Every field the popover shows, by its Place Details (New) name (no
 * `places.` prefix on this endpoint). An unknown name fails the whole request
 * with a 400, so each one here was checked against Google's field list and a
 * live call. `editorialSummary` bills at Enterprise + Atmosphere, the rest at
 * Enterprise or below.
 */
export const DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "editorialSummary",
  "rating",
  "userRatingCount",
  "priceLevel",
  "regularOpeningHours.weekdayDescriptions",
  "websiteUri",
  "internationalPhoneNumber",
  "googleMapsUri",
  "primaryTypeDisplayName",
  "businessStatus",
  "photos",
].join(",")

/** Text Search when there is no place id: the id, name and point are all the match rule needs. */
const MATCH_FIELDS = "places.id,places.displayName,places.location"

/** How far the top hit may sit from the idea's pin and still be it. */
export const MATCH_RADIUS_M = 300
export const MAX_PHOTOS = 6
const PHOTO_WIDTH_PX = 1200
const TIMEOUT_MS = 5_000
const PHOTO_TIMEOUT_MS = 3_500

/**
 * A place id goes into a URL path, so only Google's own alphabet passes.
 * Ids are usually 27 characters; some run longer.
 */
export const PLACE_ID = /^[A-Za-z0-9_-]{8,256}$/
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]{8,256}\/photos\/[A-Za-z0-9_-]{8,1024}$/

const PRICE: Record<string, 0 | 1 | 2 | 3 | 4> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

export interface RawDetails {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  editorialSummary?: { text?: string }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  websiteUri?: string
  internationalPhoneNumber?: string
  googleMapsUri?: string
  primaryTypeDisplayName?: { text?: string }
  businessStatus?: string
  photos?: Array<{
    name?: string
    widthPx?: number
    heightPx?: number
    authorAttributions?: Array<{ displayName?: string; uri?: string }>
  }>
}

/** `value` as an http(s) URL, else nothing: these land in `href`s. */
export function webUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined
  } catch {
    return undefined
  }
}

const text = (value: { text?: string } | undefined) => value?.text?.trim() || undefined

/** Raw Place Details → what the popover shows. Photos are resolved separately. */
export function toPlaceDetails(raw: RawDetails, photos: PlacePhoto[]): PlaceDetails | null {
  const name = text(raw.displayName)
  if (!name) return null
  const details: PlaceDetails = { name, photos }
  if (raw.id) details.placeId = raw.id
  const summary = text(raw.editorialSummary)
  if (summary) {
    details.summary = summary
    details.summarySource = "google"
  }
  const address = raw.formattedAddress?.trim()
  if (address) details.address = address
  if (typeof raw.rating === "number" && raw.rating >= 1 && raw.rating <= 5) details.rating = raw.rating
  if (typeof raw.userRatingCount === "number" && raw.userRatingCount >= 0) details.ratingCount = Math.round(raw.userRatingCount)
  const price = raw.priceLevel ? PRICE[raw.priceLevel] : undefined
  if (price !== undefined) details.priceLevel = price
  const hours = raw.regularOpeningHours?.weekdayDescriptions?.filter((line) => typeof line === "string" && line.trim())
  if (hours?.length) details.hours = hours.slice(0, 7)
  const website = webUrl(raw.websiteUri)
  if (website) details.website = website
  const phone = raw.internationalPhoneNumber?.trim()
  if (phone) details.phone = phone
  // `g_mp` only tells Google which API produced the link.
  const maps = webUrl(raw.googleMapsUri?.split("&g_mp=")[0])
  if (maps) details.mapsUrl = maps
  const typeLabel = text(raw.primaryTypeDisplayName)
  if (typeLabel) details.typeLabel = typeLabel
  return details
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/** Words that say what kind of place it is, not which one ("Cafe Onion" vs "Onion Bakery"). */
const GENERIC = new Set(["the", "a", "of", "and", "cafe", "coffee", "restaurant", "bar", "hotel", "shop", "store", "market", "palace", "museum", "park", "temple", "station", "street", "branch"])

/**
 * Whether Google's name for the top hit plausibly names the idea: the same
 * after folding case and accents, one inside the other as whole words
 * ("Gyeongbokgung" / "Gyeongbokgung Palace", via `sameVenue`), or most of the
 * idea's distinctive words present ("Onion Anguk" / "Cafe Onion Anguk").
 */
export function plausibleName(wanted: string, found: string): boolean {
  const a = norm(wanted)
  const b = norm(found)
  if (!a || !b) return false
  if (a === b || sameVenue(wanted, found)) return true
  // A lone short word ("Bo") says too little to stake a venue on.
  const words = a.split(" ").filter((word) => word.length >= 2 && !GENERIC.has(word))
  if (words.length === 0 || (words.length === 1 && words[0]!.length < 4)) return false
  const theirs = new Set(b.split(" "))
  const shared = words.filter((word) => theirs.has(word)).length
  return shared / words.length >= 0.6
}

/**
 * The language to ask Text Search for names in when matching: the one the
 * idea's name is written in, read from its script, for the scripts that
 * name one language well enough; English otherwise.
 */
export function nameLanguage(name: string): string {
  if (/\p{Script=Hangul}/u.test(name)) return "ko"
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name)) return "ja"
  if (/\p{Script=Han}/u.test(name)) return "zh"
  if (/\p{Script=Thai}/u.test(name)) return "th"
  if (/\p{Script=Greek}/u.test(name)) return "el"
  return "en"
}

/** A bounded map whose entries lapse; the oldest goes first when full. */
function lapsingMap<T>(maxEntries: number, now: () => number) {
  const entries = new Map<string, { until: number; value: T }>()
  return {
    get(key: string): { value: T } | undefined {
      const hit = entries.get(key)
      if (!hit) return undefined
      if (now() < hit.until) return hit
      entries.delete(key)
      return undefined
    },
    set(key: string, value: T, keepMs: number) {
      entries.delete(key)
      // Map order is insertion order, so the first key is the oldest.
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
      entries.set(key, { until: now() + keepMs, value })
    },
  }
}

/** An answer missing a photo that timed out is kept only briefly, so the next open can fill it in. */
const PARTIAL_TTL_MS = 2 * 60_000

export interface PlaceDetailsOptions {
  /**
   * How long an answer is reused. Photo URIs carry no documented lifetime
   * (Google says only that a photo *name* expires and may not be cached); the
   * images they point to are served `max-age=86400`. Half an hour stays far
   * inside that, and an <img> that still fails drops its photo client-side.
   */
  ttlMs?: number
  maxEntries?: number
  now?: () => number
}

/** Google Places (New) Place Details, with Text Search to find the place when there is no id. */
export function createGooglePlaceDetails(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  { ttlMs = 30 * 60_000, maxEntries = 300, now = Date.now }: PlaceDetailsOptions = {},
): PlaceDetailsLookup {
  /** Answers by place id. */
  const answers = lapsingMap<PlaceDetails | null>(maxEntries, now)
  /** Which place id a name at a point turned out to be (null: none we trust). */
  const matches = lapsingMap<string | null>(maxEntries, now)

  const call = async (url: string, init: RequestInit, signal: AbortSignal | undefined, timeoutMs = TIMEOUT_MS) => {
    const deadline = AbortSignal.timeout(timeoutMs)
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Goog-Api-Key": apiKey },
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    })
    if (!res.ok) {
      // Read only to classify; the body never leaves this function.
      const unknownId = res.status === 400 && UNKNOWN_ID.test(await res.text().catch(() => ""))
      throw new PlaceDetailsUpstreamError(res.status, unknownId)
    }
    return res
  }

  /** The top Text Search hit, when it is close to the pin and plausibly the same name. */
  const findId = async (name: string, near: LatLng, signal?: AbortSignal): Promise<string | null> => {
    const res = await call(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-FieldMask": MATCH_FIELDS },
        body: JSON.stringify({
          textQuery: name,
          pageSize: 1,
          // Google's name comes back in this language, so a name written in
          // Hangul is compared with the Hangul name, not the English one.
          languageCode: nameLanguage(name),
          // A bias only ranks; the distance check below is what keeps it local.
          locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 1_000 } },
        }),
      },
      signal,
    )
    const json = (await res.json()) as { places?: RawDetails[] }
    const top = json.places?.[0]
    const lat = top?.location?.latitude
    const lng = top?.location?.longitude
    const found = text(top?.displayName)
    if (!top?.id || !PLACE_ID.test(top.id) || !found || typeof lat !== "number" || typeof lng !== "number") return null
    if (haversineMeters(near, { lat, lng }) > MATCH_RADIUS_M) return null
    return plausibleName(name, found) ? top.id : null
  }

  /** One photo's keyless URI, or null when it fails, is slow, or is not what we expect. */
  const photoUri = async (photoName: string, signal?: AbortSignal): Promise<string | null> => {
    if (!PHOTO_NAME.test(photoName)) return null
    try {
      const res = await call(
        `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_WIDTH_PX}&skipHttpRedirect=true`,
        { method: "GET" },
        signal,
        PHOTO_TIMEOUT_MS,
      )
      const json = (await res.json()) as { photoUri?: string }
      const uri = json.photoUri
      if (!uri || uri.includes(apiKey)) return null
      return new URL(uri).protocol === "https:" ? uri : null
    } catch {
      // One photo missing is not a failure of the popover.
      return null
    }
  }

  /** The first photos with a working URI; `complete` is false when one of them failed. */
  const photosOf = async (raw: RawDetails, signal?: AbortSignal): Promise<{ photos: PlacePhoto[]; complete: boolean }> => {
    const wanted = (raw.photos ?? []).filter((photo) => photo.name).slice(0, MAX_PHOTOS)
    const uris = await Promise.all(wanted.map((photo) => photoUri(photo.name!, signal)))
    const photos: PlacePhoto[] = []
    wanted.forEach((photo, index) => {
      const url = uris[index]
      if (!url) return
      const out: PlacePhoto = { url }
      // The served image is scaled to fit 1200 px wide; the ratio is what the layout needs.
      if (photo.widthPx && photo.heightPx) {
        const scale = Math.min(1, PHOTO_WIDTH_PX / photo.widthPx)
        out.width = Math.round(photo.widthPx * scale)
        out.height = Math.round(photo.heightPx * scale)
      }
      const author = photo.authorAttributions?.find((who) => who.displayName?.trim())
      if (author) {
        out.author = { name: author.displayName!.trim() }
        const uri = webUrl(author.uri)
        if (uri) out.author.uri = uri
      }
      photos.push(out)
    })
    return { photos, complete: photos.length === wanted.length }
  }

  const byId = async (placeId: string, signal?: AbortSignal): Promise<PlaceDetails | null> => {
    const hit = answers.get(placeId)
    if (hit) return hit.value
    let res: Response
    try {
      res = await call(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
        { method: "GET", headers: { "X-Goog-FieldMask": DETAILS_FIELDS } },
        signal,
      )
    } catch (err) {
      // An id Google no longer knows (places move and merge) is an answer: nothing.
      // Any other 400 stays a failure, so a broken field mask is never mistaken for an empty place.
      if (err instanceof PlaceDetailsUpstreamError && (err.status === 404 || err.unknownId)) {
        answers.set(placeId, null, ttlMs)
        return null
      }
      throw err
    }
    const raw = (await res.json()) as RawDetails
    if (raw.businessStatus === "CLOSED_PERMANENTLY") {
      answers.set(placeId, null, ttlMs)
      return null
    }
    const { photos, complete } = await photosOf(raw, signal)
    // Photos cut short by the caller hanging up are not an answer to keep.
    if (signal?.aborted) throw new DOMException("aborted", "AbortError")
    const details = toPlaceDetails(raw, photos)
    answers.set(placeId, details, complete ? ttlMs : Math.min(ttlMs, PARTIAL_TTL_MS))
    return details
  }

  const byName = async ({ name, near }: NamedPoint, signal?: AbortSignal): Promise<PlaceDetails | null> => {
    const key = `${norm(name)}|${near.lat.toFixed(4)},${near.lng.toFixed(4)}`
    let match = matches.get(key)
    if (!match) {
      match = { value: await findId(name, near, signal) }
      matches.set(key, match.value, ttlMs)
    }
    return match.value ? byId(match.value, signal) : null
  }

  return async (query, signal) => {
    if (!("placeId" in query)) return byName(query, signal)
    const found = PLACE_ID.test(query.placeId) ? await byId(query.placeId, signal) : null
    return found ?? (query.fallback ? byName(query.fallback, signal) : null)
  }
}
