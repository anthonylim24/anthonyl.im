import { haversineMeters } from "../data/koreaPlaces"
import type { PlacePhoto } from "./apiShapes"
import type { LatLng } from "./conciergeTools"

// What the wishlist's details popover shows for one place: photos, a summary,
// rating, price, hours and links, from Google Places (New) Place Details.
// Fetched when the popover opens, never written to the trip.
//
// The Maps key stays on this server. It travels only in the `X-Goog-Api-Key`
// header (Place Details and photo media both accept it there), so no URL this
// module builds carries it, and photo media is asked for with
// `skipHttpRedirect=true`, which answers a keyless `photoUri` on
// lh3.googleusercontent.com that goes straight into an <img>. Every call
// refuses redirects (`redirect: "error"`): fetch would carry the key header
// to wherever a redirect points, another origin included.

/** Mirrors `PlaceDetails` in `frontend/src/pages/Trips/ideas/contract.ts`. */
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
 * valid." (measured), and documents NOT_FOUND for it too. A broken field mask
 * is a 400 "Request contains an invalid argument.", so the message must be
 * about the place id, not merely say "invalid".
 */
const UNKNOWN_ID_MESSAGE = /\bplace ?id\b[\s\S]{0,300}?\b(?:is not valid|is no longer valid|is invalid|not found)\b|\b(?:invalid|not a valid|unknown) place ?id\b/i

/** Whether an error answer says the id itself is unknown. Reads the body only to decide; nothing of it leaves. */
async function saysUnknownId(res: Response): Promise<boolean> {
  if (res.status === 404) return true
  if (res.status !== 400) return false
  let error: { status?: unknown; message?: unknown } | undefined
  try {
    error = ((await res.json()) as { error?: { status?: unknown; message?: unknown } } | null)?.error
  } catch {
    return false
  }
  if (error?.status === "NOT_FOUND") return true
  return typeof error?.message === "string" && UNKNOWN_ID_MESSAGE.test(error.message)
}

/**
 * Every field the popover shows, by its Place Details (New) name (no
 * `places.` prefix on this endpoint), plus `businessStatus` and
 * `movedPlaceId` to tell a closed or moved place. An unknown name fails the
 * whole request with a 400, so each one here was checked against Google's
 * field list and a live call. `editorialSummary` bills at Enterprise +
 * Atmosphere, the rest at Enterprise or below (`movedPlaceId` at IDs Only).
 */
export const DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
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
  "movedPlaceId",
  "photos",
].join(",")

/** Text Search when there is no place id: the id, name and point are all the match rule needs. */
const MATCH_FIELDS = "places.id,places.displayName,places.location,places.primaryType"

/** How far the top hit may sit from the idea's pin and still be it. */
export const MATCH_RADIUS_M = 300
/**
 * Parks, mountains and neighbourhoods are kilometres across: an idea pinned
 * anywhere in Bukhansan sits far from Google's point for it (4.7 km, measured).
 * Such a hit may be this far away, but only when its name is the idea's own
 * (`sameName`). A city is not on the list: "Seoul Forest" is never "Seoul".
 */
export const AREA_MATCH_RADIUS_M = 10_000
const AREA_TYPES = new Set([
  "national_park", "state_park", "park", "hiking_area", "natural_feature", "mountain_peak", "beach", "island",
  "lake", "river", "neighborhood", "sublocality", "sublocality_level_1", "sublocality_level_2",
  "botanical_garden", "garden", "zoo", "campground", "ski_resort", "historical_place", "cultural_landmark",
])
export const MAX_PHOTOS = 6
const PHOTO_WIDTH_PX = 1200

/**
 * How long a lookup may take. The client gives up at 15 s; the worst path
 * (an id Google has lost, Text Search, Place Details, photos) is four calls
 * in a row, so the whole lookup has one deadline that answers well before
 * the client's, and each call its own shorter one. Photos get what is left
 * (less `reserveMs` to answer in): past the deadline the popover opens with
 * fewer photos rather than none at all.
 */
export interface PlaceDetailsTimeouts {
  totalMs: number
  stepMs: number
  photoMs: number
  reserveMs: number
}
export const DETAILS_TIMEOUTS: PlaceDetailsTimeouts = { totalMs: 11_000, stepMs: 4_000, photoMs: 3_000, reserveMs: 250 }

/**
 * A place id goes into a URL path, so only Google's own alphabet passes.
 * Ids are usually 27 characters; some run longer.
 */
export const PLACE_ID = /^[A-Za-z0-9_-]{8,256}$/
export const PHOTO_NAME = /^places\/[A-Za-z0-9_-]{8,256}\/photos\/[A-Za-z0-9_-]{8,1024}$/

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
  /** Text Search only: Place Details does not ask for it. */
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
  primaryType?: string
  businessStatus?: string
  /** A bare place id: where a permanently closed place moved to. */
  movedPlaceId?: string
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

/** One Google photo as the client shows it: its keyless URL, its size as served (scaled to fit `widthPx`), and who took it. */
export function toPlacePhoto(photo: NonNullable<RawDetails["photos"]>[number], url: string, widthPx: number): PlacePhoto {
  const out: PlacePhoto = { url }
  if (photo.widthPx && photo.heightPx) {
    const scale = Math.min(1, widthPx / photo.widthPx)
    out.width = Math.round(photo.widthPx * scale)
    out.height = Math.round(photo.heightPx * scale)
  }
  const author = photo.authorAttributions?.find((who) => who.displayName?.trim())
  if (author) {
    out.author = { name: author.displayName!.trim() }
    const uri = webUrl(author.uri)
    if (uri) out.author.uri = uri
  }
  return out
}

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

// ── Is Google's top hit the idea? ──────────────────────────────────────────

/**
 * A name folded for comparing: lower case, compatibility forms unified,
 * Latin accents dropped ("Café" is "cafe"), punctuation as word breaks.
 * Only the accents in U+0300–036F go. Other combining marks are part of the
 * letter: kana voicing marks tell バ from ハ and プ from フ, and Thai vowel
 * and tone marks sit inside words, so they recompose (NFC) and stay.
 */
export const foldName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()

const foldedSet = (lists: readonly string[]) => new Set(lists.join(" ").split(" ").map(foldName))

/**
 * Words that say what kind of place it is or what it serves, not which one
 * ("Sushi Saito" vs "Sushi Sho"). They never count as the name, and when
 * both names have some, they must share one: "Sushi Saito" is not "Ramen
 * Saito", "Gyeongbokgung Station" not "Gyeongbokgung Palace".
 */
const KIND = foldedSet([
  // Kinds of place.
  "cafe coffee roasters roastery tea restaurant eatery diner dining kitchen bistro brasserie grill bar pub izakaya brewery " +
    "bakery hotel hostel inn shop store market palace museum gallery park temple shrine station street",
  // What it serves.
  "food cuisine ramen sushi udon soba tempura yakitori curry pizza pizzeria chicken bibimbap fish seafood noodle noodles bbq barbecue " +
    "burger burgers steak steakhouse dumpling dumplings mandu naengmyeon galbi bulgogi tteokbokki kimbap gukbap hotpot pho taco tacos " +
    "bagel bagels donut donuts dessert beer wine cocktail korean japanese chinese thai italian french",
  // The same in the scripts these trips use most.
  "카페 커피 식당 カフェ ラーメン 寿司 すし レストラン 食堂 居酒屋 喫茶 店 餐厅 咖啡 咖啡厅 ร้าน ร้านกาแฟ ร้านอาหาร คาเฟ่",
])

/** Words that name nothing: filler, and which branch of a place it is. */
const GENERIC = new Set([
  ...KIND,
  ...foldedSet(["the a an of and at in on de la le du branch main official flagship 본점 지점 本店 支店"]),
])

/** Han, kana and Hangul pack a name into few characters: two can name a place ("一蘭"). */
const DENSE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const longEnough = (word: string) => Array.from(word).length >= (DENSE.test(word) ? 2 : 4)

/**
 * Whether Google's name for the top hit plausibly names the idea: the same
 * once folded (`sameName`), or most of the idea's distinctive words (the
 * `GENERIC` ones left out) found among Google's, its head word included.
 *
 * - The head word (the first distinctive one) is the name: "Pizza Hut
 *   Itaewon" is not "Pizza Express Itaewon", "Ramen Nagi Shinjuku" is not
 *   "Ramen Fuunji Shinjuku".
 * - At least 60% must be shared, so a two-word name needs both: "Myeongdong
 *   Kyoja" is not "Myeongdong Hamheung", and a district both names share
 *   never carries a match on its own.
 * - A one-word name must be long enough to stake a venue on ("Bo" is not).
 * - When both say what kind of place they are (`KIND`), they agree on it.
 *
 * Misses are cheap (the popover falls back to Wikipedia or the idea's own
 * notes) and a wrong venue is not, so this errs strict: "Ichiran Shibuya"
 * does not match a top hit named just "Ichiran".
 */
export function plausibleName(wanted: string, found: string): boolean {
  if (sameName(wanted, found)) return true
  const all = foldName(wanted).split(" ")
  const theirs = new Set(foldName(found).split(" "))
  const ourKinds = all.filter((word) => KIND.has(word))
  const theirKinds = [...theirs].filter((word) => KIND.has(word))
  if (ourKinds.length > 0 && theirKinds.length > 0 && !ourKinds.some((word) => theirs.has(word))) return false
  const words = all.filter((word) => word && !GENERIC.has(word))
  const head = words[0]
  if (!head || (words.length === 1 && !longEnough(head))) return false
  if (!theirs.has(head)) return false
  return words.filter((word) => theirs.has(word)).length / words.length >= 0.6
}

/**
 * The same name once folded: the only match trusted from kilometres off. Not
 * containment, which takes "Seoul Forest" for the city of Seoul and "Hangang
 * Park" for "Yeouido Hangang Park".
 */
export function sameName(wanted: string, found: string): boolean {
  const a = foldName(wanted)
  return a !== "" && a === foldName(found)
}

type Box = readonly [south: number, north: number, west: number, east: number]
const inBox = ({ lat, lng }: LatLng, [south, north, west, east]: Box) => lat >= south && lat <= north && lng >= west && lng <= east

/**
 * Rough boxes, drawn to keep Korea and the mainland out: Honshu to Kyushu
 * east of Busan's longitude, Tsushima, the Ryukyus; Taiwan; Hong Kong and
 * Macau. A miss only means Google is asked in Chinese.
 */
const JAPAN: readonly Box[] = [
  [31, 45.6, 129.5, 146],
  [32.5, 34.75, 128.75, 129.5],
  [24, 31, 122.9, 131.5],
]
const TRADITIONAL_CHINESE: readonly Box[] = [
  [21.8, 25.4, 119.3, 122.1],
  [22.15, 22.5, 113.83, 114.45],
  [22.1, 22.22, 113.52, 113.6],
]

/**
 * The language to ask Text Search for names in when matching: the one the
 * idea's name is written in, read from its script, for the scripts that
 * name one language well enough; English otherwise. A name in Han alone is
 * Japanese in Japan ("金閣寺"), traditional Chinese in Taiwan and Hong Kong,
 * and Chinese elsewhere, so the point decides.
 */
export function nameLanguage(name: string, near?: LatLng): string {
  if (/\p{Script=Hangul}/u.test(name)) return "ko"
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name)) return "ja"
  if (/\p{Script=Han}/u.test(name)) {
    if (near && JAPAN.some((box) => inBox(near, box))) return "ja"
    if (near && TRADITIONAL_CHINESE.some((box) => inBox(near, box))) return "zh-TW"
    return "zh"
  }
  if (/\p{Script=Thai}/u.test(name)) return "th"
  if (/\p{Script=Greek}/u.test(name)) return "el"
  return "en"
}

// ── The lookup ─────────────────────────────────────────────────────────────

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

/**
 * What one place id turned out to be. Only `unknown` lets the caller try
 * the name and point instead: a place that closed for good is an answer
 * (nothing), and finding "it" again by name would find a neighbour.
 */
type IdOutcome =
  | { kind: "place"; details: PlaceDetails }
  | { kind: "moved"; to: string }
  | { kind: "closed" }
  | { kind: "unknown" }

/** One lookup's clock: the caller's signal, and the deadline every call inside it shares. */
interface Budget {
  caller?: AbortSignal
  signal: AbortSignal
  until: number
}

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
  timeouts?: Partial<PlaceDetailsTimeouts>
}

/** Google Places (New) Place Details, with Text Search to find the place when there is no id. */
export function createGooglePlaceDetails(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  { ttlMs = 30 * 60_000, maxEntries = 300, now = Date.now, timeouts: given = {} }: PlaceDetailsOptions = {},
): PlaceDetailsLookup {
  const timeouts = { ...DETAILS_TIMEOUTS, ...given }
  /** What each place id turned out to be. */
  const answers = lapsingMap<IdOutcome>(maxEntries, now)
  /** Which place id a name at a point turned out to be (null: none we trust). */
  const matches = lapsingMap<string | null>(maxEntries, now)

  const call = async (url: string, init: RequestInit, budget: Budget, stepMs: number) => {
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Goog-Api-Key": apiKey },
      redirect: "error",
      signal: AbortSignal.any([budget.signal, AbortSignal.timeout(stepMs)]),
    })
    if (!res.ok) throw new PlaceDetailsUpstreamError(res.status, await saysUnknownId(res).catch(() => false))
    return res
  }

  /** The top Text Search hit, when it is close to the pin and plausibly the same name. */
  const findId = async (name: string, near: LatLng, budget: Budget): Promise<string | null> => {
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
          languageCode: nameLanguage(name, near),
          // A bias only ranks; the distance check below is what keeps it local.
          locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 1_000 } },
        }),
      },
      budget,
      timeouts.stepMs,
    )
    const json = (await res.json()) as { places?: RawDetails[] }
    const top = json.places?.[0]
    const lat = top?.location?.latitude
    const lng = top?.location?.longitude
    const found = text(top?.displayName)
    if (!top?.id || !PLACE_ID.test(top.id) || !found || typeof lat !== "number" || typeof lng !== "number") return null
    const meters = haversineMeters(near, { lat, lng })
    if (meters <= MATCH_RADIUS_M) return plausibleName(name, found) ? top.id : null
    const area = top.primaryType !== undefined && AREA_TYPES.has(top.primaryType)
    return area && meters <= AREA_MATCH_RADIUS_M && sameName(name, found) ? top.id : null
  }

  /** One photo's keyless URI, or null when it fails, is slow, or is not what we expect. */
  const photoUri = async (photoName: string, budget: Budget, photoMs: number): Promise<string | null> => {
    if (!PHOTO_NAME.test(photoName)) return null
    try {
      const res = await call(
        `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_WIDTH_PX}&skipHttpRedirect=true`,
        { method: "GET" },
        budget,
        photoMs,
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

  /** The first photos with a working URI, within what is left of the budget; `complete` is false when one of them is missing. */
  const photosOf = async (raw: RawDetails, budget: Budget): Promise<{ photos: PlacePhoto[]; complete: boolean }> => {
    const wanted = (raw.photos ?? []).filter((photo) => photo.name).slice(0, MAX_PHOTOS)
    const photoMs = Math.min(timeouts.photoMs, budget.until - Date.now() - timeouts.reserveMs)
    if (wanted.length === 0) return { photos: [], complete: true }
    if (photoMs <= 0) return { photos: [], complete: false }
    const uris = await Promise.all(wanted.map((photo) => photoUri(photo.name!, budget, photoMs)))
    const photos: PlacePhoto[] = []
    wanted.forEach((photo, index) => {
      const url = uris[index]
      if (url) photos.push(toPlacePhoto(photo, url, PHOTO_WIDTH_PX))
    })
    return { photos, complete: photos.length === wanted.length }
  }

  const fetchId = async (placeId: string, budget: Budget): Promise<IdOutcome> => {
    let res: Response
    try {
      res = await call(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
        { method: "GET", headers: { "X-Goog-FieldMask": DETAILS_FIELDS } },
        budget,
        timeouts.stepMs,
      )
    } catch (err) {
      // An id Google no longer knows (places move and merge) is an answer: nothing.
      // Any other 400 stays a failure, so a broken field mask is never mistaken for an empty place.
      if (err instanceof PlaceDetailsUpstreamError && err.unknownId) {
        answers.set(placeId, { kind: "unknown" }, ttlMs)
        return { kind: "unknown" }
      }
      throw err
    }
    const raw = (await res.json()) as RawDetails
    if (raw.businessStatus === "CLOSED_PERMANENTLY") {
      const to = raw.movedPlaceId
      const outcome: IdOutcome = to && to !== placeId && PLACE_ID.test(to) ? { kind: "moved", to } : { kind: "closed" }
      answers.set(placeId, outcome, ttlMs)
      return outcome
    }
    const { photos, complete } = await photosOf(raw, budget)
    // Photos cut short by the caller hanging up are not an answer to keep.
    if (budget.caller?.aborted) throw new DOMException("aborted", "AbortError")
    const details = toPlaceDetails(raw, photos)
    const outcome: IdOutcome = details ? { kind: "place", details } : { kind: "unknown" }
    answers.set(placeId, outcome, complete ? ttlMs : Math.min(ttlMs, PARTIAL_TTL_MS))
    return outcome
  }

  /** What `placeId` is, following a move once (Google gives the first new home, and a second hop is a chain we do not chase). */
  const byId = async (placeId: string, budget: Budget): Promise<IdOutcome> => {
    const outcome = answers.get(placeId)?.value ?? (await fetchId(placeId, budget))
    if (outcome.kind !== "moved") return outcome
    const next = answers.get(outcome.to)?.value ?? (await fetchId(outcome.to, budget))
    // The old place closed for good either way. A new home Google cannot show,
    // or one that moved again, is still nothing: searching by name would land on a neighbour.
    return next.kind === "place" ? next : { kind: "closed" }
  }

  const byName = async ({ name, near }: NamedPoint, budget: Budget): Promise<PlaceDetails | null> => {
    const key = `${foldName(name)}|${near.lat.toFixed(4)},${near.lng.toFixed(4)}`
    let match = matches.get(key)
    if (!match) {
      match = { value: await findId(name, near, budget) }
      matches.set(key, match.value, ttlMs)
    }
    if (!match.value) return null
    const outcome = await byId(match.value, budget)
    return outcome.kind === "place" ? outcome.details : null
  }

  return async (query, signal) => {
    const deadline = AbortSignal.timeout(timeouts.totalMs)
    const budget: Budget = {
      caller: signal,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      until: Date.now() + timeouts.totalMs,
    }
    if (!("placeId" in query)) return byName(query, budget)
    const outcome: IdOutcome = PLACE_ID.test(query.placeId) ? await byId(query.placeId, budget) : { kind: "unknown" }
    if (outcome.kind === "place") return outcome.details
    return outcome.kind === "unknown" && query.fallback ? byName(query.fallback, budget) : null
  }
}
