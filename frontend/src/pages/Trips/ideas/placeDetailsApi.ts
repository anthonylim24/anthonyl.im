import { Effect, Schema } from "effect"
import { DecodeError, HttpStatusError } from "../../../effect/errors"
import { fetchExternal, parseJson, requestJson, type GetToken } from "../../../effect/http"
import { runPromise } from "../../../effect/runtime"
import { BUSINESS } from "../stopPhoto"
import type { ItineraryItem } from "../types"
import type { PlaceDetails, PlacePhoto } from "./contract"
import { withDeadline, type Deadline } from "./deadline"

// What the details popover shows about a wishlist idea, fetched on open:
// GET /api/places/details (Google Places through the server, which keeps the
// Maps key), and Wikipedia when Google has nothing to say. Answers live for
// the session in memory, keyed by place; nothing is written to the trip.

/** Where a lookup goes for one idea. Null: the idea has neither a place id nor a point, so nothing to look up. */
export interface DetailsTarget {
  /** One place, however the idea names it: what Google's answer is kept under. */
  place: string
  /** One lookup: the place, and whether Wikipedia may fill in for Google (a business never). */
  key: string
  name: string
  placeId?: string
  point?: { lat: number; lng: number }
  /** A restaurant, hotel or shop: Wikipedia's nearest page would be some other venue. */
  business: boolean
}

/** Themes whose places are businesses, for an idea whose location has no category. */
const BUSINESS_THEMES = new Set(["food", "nightlife", "shopping"])

export function detailsTarget(idea: ItineraryItem): DetailsTarget | null {
  const location = idea.location
  const name = (location?.name || idea.title).trim()
  const placeId = location?.placeId?.trim() || undefined
  const point =
    typeof location?.lat === "number" && typeof location.lng === "number" && Number.isFinite(location.lat) && Number.isFinite(location.lng)
      ? { lat: location.lat, lng: location.lng }
      : undefined
  if (!name || (!placeId && !point)) return null
  const business = Boolean((location?.category && BUSINESS.test(location.category)) || (idea.theme && BUSINESS_THEMES.has(idea.theme)))
  const place = placeId ? `id:${placeId}` : `at:${name.toLowerCase()}|${point!.lat.toFixed(4)},${point!.lng.toFixed(4)}`
  // Re-filing an idea from Food to Sights changes what may be shown, so it is another lookup.
  return { place, key: business ? `${place}|business` : place, name, placeId, point, business }
}

/** Loading failed; `message` is the sentence to show beside Retry. */
export class PlaceDetailsError extends Schema.TaggedError<PlaceDetailsError>()("PlaceDetailsError", {
  message: Schema.String,
}) {}

export function detailsErrorMessage(status: number): string {
  if (status === 429) return "Too many places looked up in a short while. Try again in a few minutes."
  if (status === 401) return "Your session ended. Sign in again to see this place’s details."
  return "Couldn’t load this place’s details."
}

const OFFLINE = "Couldn’t reach the server. Check your connection and try again."
const TOO_SLOW = "This place’s details are taking too long. Try again in a moment."
/** The server answers within 11 s (4 s for each call to Google, 3 s for each photo); past this, something is stuck. */
const SERVER_DEADLINE_MS = 15_000
const WIKI_DEADLINE_MS = 8_000

/** An http(s) URL, or nothing: these land in `src` and `href`. */
export function webUrl(value: unknown, httpsOnly = false): string | undefined {
  if (typeof value !== "string" || !value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol === "https:" || (!httpsOnly && url.protocol === "http:")) return url.toString()
  } catch {
    // Not a URL at all.
  }
  return undefined
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined)

/** The server's answer, kept only where it has the contract's shape, field by field: nothing unknown rides along. */
export function cleanDetails(value: unknown): PlaceDetails | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const name = text(raw.name)
  if (!name) return null
  const photos: PlacePhoto[] = []
  for (const item of Array.isArray(raw.photos) ? (raw.photos as unknown[]) : []) {
    const photo = item as Partial<PlacePhoto> | null
    const url = webUrl(photo?.url, true)
    if (!photo || !url) continue
    const clean: PlacePhoto = { url }
    if (typeof photo.width === "number" && typeof photo.height === "number" && photo.width > 0 && photo.height > 0) {
      clean.width = photo.width
      clean.height = photo.height
    }
    const author = text(photo.author?.name)
    if (author) {
      clean.author = { name: author }
      const uri = webUrl(photo.author?.uri)
      if (uri) clean.author.uri = uri
    }
    photos.push(clean)
  }
  const details: PlaceDetails = { name, photos }
  const placeId = text(raw.placeId)
  if (placeId) details.placeId = placeId
  const summary = text(raw.summary)
  if (summary) details.summary = summary
  if (raw.summarySource === "google" || raw.summarySource === "wikipedia") details.summarySource = raw.summarySource
  for (const field of ["website", "mapsUrl", "summaryUrl"] as const) {
    const url = webUrl(raw[field])
    if (url) details[field] = url
  }
  for (const field of ["address", "phone", "typeLabel"] as const) {
    const value = text(raw[field])
    if (value) details[field] = value
  }
  const rating = raw.rating
  if (typeof rating === "number" && Number.isFinite(rating) && rating >= 1 && rating <= 5) details.rating = rating
  const ratingCount = raw.ratingCount
  if (typeof ratingCount === "number" && Number.isInteger(ratingCount) && ratingCount >= 0) details.ratingCount = ratingCount
  const price = raw.priceLevel
  if (price === 0 || price === 1 || price === 2 || price === 3 || price === 4) details.priceLevel = price
  if (Array.isArray(raw.hours)) {
    const hours = (raw.hours as unknown[]).map(text).filter((line): line is string => line !== undefined)
    if (hours.length > 0) details.hours = hours
  }
  return details
}

/** Runs `use` with a signal that also ends at the deadline; the clock stops when it settles. */
const withinDeadline = <A, E>(signal: AbortSignal | undefined, ms: number, use: (deadline: Deadline) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => withDeadline(signal, ms)),
    use,
    (deadline) => Effect.sync(deadline.release),
  )

/**
 * Statuses that mean "Google can say nothing about this place", like `place:
 * null`: 503, the server has no Maps key; 400, the idea's id or name is not
 * one the server can look up (an id from another map service). Retrying
 * either would never help.
 */
const NOTHING_KNOWN = new Set([400, 503])

/** Google, through the server. The name and point ride along with an id, so a place Google has since merged is still found. */
const fromServer = Effect.fn("PlaceDetails.server")(function* (getToken: GetToken, target: DetailsTarget, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (target.placeId) params.set("placeId", target.placeId)
  if (target.point) {
    params.set("name", target.name.slice(0, 200))
    params.set("lat", String(target.point.lat))
    params.set("lng", String(target.point.lng))
  }
  const body = yield* withinDeadline(signal, SERVER_DEADLINE_MS, (deadline) =>
    requestJson<{ place?: unknown }>(getToken, `/api/places/details?${params}`, { signal: deadline.signal }).pipe(
      Effect.catchIf(
        (err): err is HttpStatusError => err instanceof HttpStatusError && NOTHING_KNOWN.has(err.status),
        () => Effect.succeed({ place: null }),
      ),
      Effect.mapError((err) =>
        err instanceof HttpStatusError
          ? new PlaceDetailsError({ message: detailsErrorMessage(err.status) })
          : // A server that is reachable but slow is not a connection problem.
            new PlaceDetailsError({ message: deadline.timedOut() ? TOO_SLOW : OFFLINE }),
      ),
    ),
  )
  return cleanDetails(body.place)
})

// ── Wikipedia ────────────────────────────────────────────────────────────

const WIKI = "https://en.wikipedia.org/w/api.php"
/** How far from the idea's pin a Wikipedia article may be geotagged (a palace's tag can sit at its centre, far from its gate). */
const WIKI_RADIUS_M = 1_500
const WIKI_PHOTOS = 4
/** Files that illustrate an article but are not a picture of the place. */
const NOT_A_PHOTO = /\b(map|plan|logo|flag|seal|emblem|coat of arms|diagram|chart|locator|icon|signature)\b|지도|도면/i

const foldName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/**
 * Whether a Wikipedia title names the idea: the same once case, accents and a
 * "(disambiguation)" are folded, or the title inside the idea's name as whole
 * words of four letters or more (idea "Gyeongbokgung Palace", article
 * "Gyeongbokgung"). Never the other way: idea "Seoul" is not "Seoul Station".
 */
export function titleMatches(name: string, title: string): boolean {
  const wanted = foldName(name)
  const page = foldName(title.replace(/\s*\([^)]*\)$/, ""))
  if (!wanted || !page) return false
  if (wanted === page) return true
  return page.length >= 4 && ` ${wanted} `.includes(` ${page} `)
}

/** Wikipedia answered with an error status. */
class WikipediaError extends Schema.TaggedError<WikipediaError>()("WikipediaError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

const wikiGet = <T>(params: Record<string, string>, signal?: AbortSignal): Effect.Effect<T, Error | WikipediaError | DecodeError> =>
  withinDeadline(signal, WIKI_DEADLINE_MS, (deadline) =>
    fetchExternal(`${WIKI}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`, {
      signal: deadline.signal,
    }).pipe(
      Effect.flatMap((res): Effect.Effect<T, DecodeError | WikipediaError> =>
        res.ok ? parseJson<T>(res) : Effect.fail(new WikipediaError({ status: res.status, message: `Wikipedia answered ${res.status}` })),
      ),
    ),
  )

interface GeoSearch {
  query?: { geosearch?: Array<{ pageid?: number; title?: string }> }
}
interface WikiPage {
  query?: {
    pages?: Array<{ title?: string; extract?: string; fullurl?: string; pageimage?: string; thumbnail?: { source?: string; width?: number; height?: number } }>
  }
}
interface WikiImages {
  query?: {
    pages?: Array<{
      title?: string
      imageinfo?: Array<{
        mime?: string
        width?: number
        thumburl?: string
        thumbwidth?: number
        thumbheight?: number
        descriptionurl?: string
        extmetadata?: { Artist?: { value?: string } }
      }>
    }>
  }
}

/** Commons' Artist field is HTML; the visible name, or nothing when it says only "unknown". */
export function artistName(html: string | undefined): string | undefined {
  if (!html) return undefined
  const text = html
    .replace(/<span[^>]*display:\s*none[^>]*>.*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
  if (!text || /^unknown/i.test(text)) return undefined
  return text.slice(0, 80)
}

/**
 * The Wikipedia article geotagged near the idea's pin whose title names it:
 * its opening sentences and lead image, then a few more large photos from the
 * article. Null when no nearby article is about this place.
 */
const fromWikipedia = Effect.fn("PlaceDetails.wikipedia")(function* (target: DetailsTarget, signal?: AbortSignal) {
  const point = target.point!
  const near = yield* wikiGet<GeoSearch>(
    { action: "query", list: "geosearch", gscoord: `${point.lat}|${point.lng}`, gsradius: String(WIKI_RADIUS_M), gslimit: "30" },
    signal,
  )
  // Nearest first: the first title that names the idea is the article.
  const hit = near.query?.geosearch?.find((page) => page.title && page.pageid && titleMatches(target.name, page.title))
  if (!hit?.pageid) return null
  const pageid = String(hit.pageid)
  const [pageBody, imageBody] = yield* Effect.all(
    [
      wikiGet<WikiPage>(
        {
          action: "query",
          pageids: pageid,
          prop: "extracts|pageimages|info",
          exintro: "1",
          explaintext: "1",
          exsentences: "3",
          piprop: "thumbnail|name",
          pithumbsize: "1200",
          inprop: "url",
        },
        signal,
      ),
      wikiGet<WikiImages>(
        {
          action: "query",
          generator: "images",
          pageids: pageid,
          gimlimit: "40",
          prop: "imageinfo",
          iiprop: "url|size|mime|extmetadata",
          iiurlwidth: "1200",
          iiextmetadatafilter: "Artist",
        },
        signal,
      ).pipe(Effect.catchAll(() => Effect.succeed<WikiImages>({}))),
    ],
    { concurrency: 2 },
  )
  const page = pageBody.query?.pages?.[0]
  if (!page) return null

  const files = imageBody.query?.pages ?? []
  const fileOf = (title: string | undefined) => files.find((file) => file.title?.replace(/^File:/, "").replace(/ /g, "_") === title)
  const photos: PlacePhoto[] = []
  const lead = webUrl(page.thumbnail?.source, true)
  const leadFile = fileOf(page.pageimage)
  if (lead) {
    const photo: PlacePhoto = { url: lead }
    if (page.thumbnail?.width && page.thumbnail.height) {
      photo.width = page.thumbnail.width
      photo.height = page.thumbnail.height
    }
    const info = leadFile?.imageinfo?.[0]
    photo.author = { name: artistName(info?.extmetadata?.Artist?.value) ?? "Wikimedia Commons" }
    const uri = webUrl(info?.descriptionurl)
    if (uri) photo.author.uri = uri
    photos.push(photo)
  }
  for (const file of files) {
    if (photos.length >= WIKI_PHOTOS) break
    if (file === leadFile || !file.title || NOT_A_PHOTO.test(file.title)) continue
    const info = file.imageinfo?.[0]
    // Large JPEGs are photographs; PNGs and SVGs are maps, logos and diagrams.
    if (info?.mime !== "image/jpeg" || (info.width ?? 0) < 1600) continue
    const url = webUrl(info.thumburl, true)
    if (!url) continue
    const photo: PlacePhoto = { url, author: { name: artistName(info.extmetadata?.Artist?.value) ?? "Wikimedia Commons" } }
    if (info.thumbwidth && info.thumbheight) {
      photo.width = info.thumbwidth
      photo.height = info.thumbheight
    }
    const uri = webUrl(info.descriptionurl)
    if (uri) photo.author!.uri = uri
    photos.push(photo)
  }

  const summary = page.extract?.trim()
  if (!summary && photos.length === 0) return null
  const details: PlaceDetails = { name: target.name, photos }
  if (summary) {
    details.summary = summary
    details.summarySource = "wikipedia"
    const url = webUrl(page.fullurl)
    if (url) details.summaryUrl = url
  }
  return details
})

// ── The loader ───────────────────────────────────────────────────────────

/**
 * How long a full answer is reused. Google's photo links carry no documented
 * lifetime; the server hands out links it may have held for up to 30 minutes,
 * and the images behind them are served for a day. Reusing an answer for 25
 * more minutes keeps every link well inside that day, and an <img> whose link
 * has lapsed anyway drops out of the carousel on its own.
 */
const KEEP_MS = 25 * 60_000
/**
 * How long an answer that may be partial is reused, matching the server's
 * own 2 minutes for one missing a photo that timed out. The server does not
 * say which answers are partial, so any Google answer with fewer photos than
 * it ever sends (6) counts; asking again within the server's 30 minutes
 * costs it nothing.
 */
const PARTIAL_KEEP_MS = 2 * 60_000
const FULL_PHOTOS = 6

interface Kept {
  until: number
  details: PlaceDetails | null
}

/** Answers kept in each cache at most; the oldest goes first. */
export const KEPT_PLACES = 200

/** Keep `details` for `place`, as the newest entry, dropping the oldest past `KEPT_PLACES`. */
function keepIn(cache: Map<string, Kept>, place: string, kept: Kept) {
  cache.delete(place)
  cache.set(place, kept)
  for (const oldest of cache.keys()) {
    if (cache.size <= KEPT_PLACES) break
    cache.delete(oldest)
  }
}

/** Google's answers by `DetailsTarget.place`. Null: Google knows nothing about the place. */
const fromGoogle = new Map<string, Kept>()
/** Wikipedia's answers by `DetailsTarget.place`, for places Google knows nothing about. Null: no article names it. Failures are never kept. */
const fromWiki = new Map<string, Kept>()

function keptIn(cache: Map<string, Kept>, key: string, now: number): PlaceDetails | null | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (now < hit.until) return hit.details
  cache.delete(key)
  return undefined
}

const wikiMayAnswer = (target: DetailsTarget) => Boolean(target.point) && !target.business

/** What a target's lookup answered in the last while; undefined when it has not settled or has lapsed. */
export function cachedPlaceDetails(target: DetailsTarget, now = Date.now()): PlaceDetails | null | undefined {
  const google = keptIn(fromGoogle, target.place, now)
  if (google !== null) return google
  return wikiMayAnswer(target) ? keptIn(fromWiki, target.place, now) : null
}

const inFlight = new Map<string, Promise<PlaceDetails | null>>()
/** When a place whose look-ahead failed may be looked up ahead again, by `DetailsTarget.key`. */
const resting = new Map<string, number>()
/** A failed look-ahead (a rate limit, no connection) is not asked again on every hover. */
const PREFETCH_REST_MS = 60_000

/** Forget every answer (tests). */
export function clearPlaceDetailsCache() {
  fromGoogle.clear()
  fromWiki.clear()
  inFlight.clear()
  resting.clear()
}

const loadEffect = Effect.fn("PlaceDetails.load")(function* (getToken: GetToken, target: DetailsTarget, signal?: AbortSignal) {
  // An answer cut short by closing the popover is not an answer to keep.
  const keep = (cache: Map<string, Kept>, details: PlaceDetails | null, ms: number) => {
    if (!signal?.aborted) keepIn(cache, target.place, { until: Date.now() + ms, details })
  }
  let google = keptIn(fromGoogle, target.place, Date.now())
  if (google === undefined) {
    google = yield* fromServer(getToken, target, signal)
    keep(fromGoogle, google, google && google.photos.length < FULL_PHOTOS ? PARTIAL_KEEP_MS : KEEP_MS)
  }
  if (google || !wikiMayAnswer(target)) return google
  const known = keptIn(fromWiki, target.place, Date.now())
  if (known !== undefined) return known
  // Wikipedia is a fallback: a failure there shows "nothing known" this time, and is asked again next time.
  return yield* fromWikipedia(target, signal).pipe(
    Effect.tap((details) => Effect.sync(() => keep(fromWiki, details, KEEP_MS))),
    Effect.catchAll(() => Effect.succeed(null)),
  )
})

/**
 * Photos and facts for one idea. Resolves null when nothing is known about the
 * place (the popover shows the idea's own notes); rejects with
 * `PlaceDetailsError` when the server could not be asked (Retry). A lookup
 * the map's preview already started is joined, never repeated; otherwise each
 * call makes its own requests, so one caller aborting never fails another.
 */
export function loadPlaceDetails(getToken: GetToken, target: DetailsTarget, signal?: AbortSignal): Promise<PlaceDetails | null> {
  const known = cachedPlaceDetails(target)
  if (known !== undefined) return Promise.resolve(known)
  return inFlight.get(target.key) ?? runPromise(loadEffect(getToken, target, signal))
}

/**
 * Look a place up before its details are opened, for the map's preview once
 * a mouse or keyboard focus has rested on its pin: one request per place
 * however often it is hovered, never cut short by the mouse moving on, and
 * kept for the details. Resolves null without asking while a failed
 * look-ahead for the place rests.
 */
export function prefetchPlaceDetails(getToken: GetToken, target: DetailsTarget, now = Date.now()): Promise<PlaceDetails | null> {
  const known = cachedPlaceDetails(target, now)
  if (known !== undefined) return Promise.resolve(known)
  const pending = inFlight.get(target.key)
  if (pending) return pending
  if ((resting.get(target.key) ?? 0) > now) return Promise.resolve(null)
  const lookup = runPromise(loadEffect(getToken, target))
    .catch((err: unknown) => {
      resting.set(target.key, Date.now() + PREFETCH_REST_MS)
      throw err
    })
    .finally(() => inFlight.delete(target.key))
  inFlight.set(target.key, lookup)
  return lookup
}
