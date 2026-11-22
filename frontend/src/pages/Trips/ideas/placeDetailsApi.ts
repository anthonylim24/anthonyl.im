import { Effect, Schema } from "effect"
import { HttpStatusError } from "../../../effect/errors"
import { fetchExternal, requestJson, type GetToken } from "../../../effect/http"
import { runPromise } from "../../../effect/runtime"
import { BUSINESS } from "../stopPhoto"
import type { ItineraryItem } from "../types"
import type { PlaceDetails, PlacePhoto } from "./contract"

// What the details popover shows about a wishlist idea, fetched on open:
// GET /api/places/details (Google Places through the server, which keeps the
// Maps key), and Wikipedia when Google has nothing to say. Answers live for
// the session in memory, keyed by place; nothing is written to the trip.

/** Where a lookup goes for one idea. Null: the idea has neither a place id nor a point, so nothing to look up. */
export interface DetailsTarget {
  /** The cache key: one place, however the idea names it. */
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
  const key = placeId ? `id:${placeId}` : `at:${name.toLowerCase()}|${point!.lat.toFixed(4)},${point!.lng.toFixed(4)}`
  return { key, name, placeId, point, business }
}

/** Loading failed; `message` is the sentence to show beside Retry. */
export class PlaceDetailsError extends Schema.TaggedError<PlaceDetailsError>()("PlaceDetailsError", {
  message: Schema.String,
}) {}

export function detailsErrorMessage(status: number): string {
  if (status === 429) return "That’s a lot of places looked up in a short while. Try again in a few minutes."
  if (status === 401) return "Your session ended. Sign in again to see this place’s details."
  return "Couldn’t load this place’s details just now."
}

const OFFLINE = "Couldn’t reach the server. Check your connection and try again."
/** The server gives Google 5 s and each photo 3.5 s; past this, something is stuck. */
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

/** The server's answer, kept only where it has the contract's shape. */
export function cleanDetails(value: unknown): PlaceDetails | null {
  const raw = value as Partial<PlaceDetails> | null | undefined
  if (!raw || typeof raw.name !== "string" || !raw.name.trim()) return null
  const photos: PlacePhoto[] = []
  for (const photo of Array.isArray(raw.photos) ? raw.photos : []) {
    const url = webUrl(photo?.url, true)
    if (!url) continue
    const clean: PlacePhoto = { url }
    if (typeof photo.width === "number" && typeof photo.height === "number" && photo.width > 0 && photo.height > 0) {
      clean.width = photo.width
      clean.height = photo.height
    }
    if (typeof photo.author?.name === "string" && photo.author.name.trim()) {
      clean.author = { name: photo.author.name.trim() }
      const uri = webUrl(photo.author.uri)
      if (uri) clean.author.uri = uri
    }
    photos.push(clean)
  }
  const details: PlaceDetails = { ...raw, name: raw.name.trim(), photos }
  for (const field of ["website", "mapsUrl", "summaryUrl"] as const) {
    if (details[field] !== undefined && !webUrl(details[field])) delete details[field]
  }
  return details
}

const withDeadline = (signal: AbortSignal | undefined, ms: number) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)

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
  const body = yield* requestJson<{ place?: unknown }>(getToken, `/api/places/details?${params}`, {
    signal: withDeadline(signal, SERVER_DEADLINE_MS),
  }).pipe(
    Effect.catchIf(
      (err): err is HttpStatusError => err instanceof HttpStatusError && NOTHING_KNOWN.has(err.status),
      () => Effect.succeed({ place: null }),
    ),
    Effect.mapError((err) =>
      err instanceof HttpStatusError
        ? new PlaceDetailsError({ message: detailsErrorMessage(err.status) })
        : new PlaceDetailsError({ message: OFFLINE }),
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

const wikiGet = <T>(params: Record<string, string>, signal?: AbortSignal) =>
  fetchExternal(`${WIKI}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`, {
    signal: withDeadline(signal, WIKI_DEADLINE_MS),
  }).pipe(
    Effect.flatMap((res) => (res.ok ? Effect.tryPromise(() => res.json() as Promise<T>) : Effect.fail(new Error(`wikipedia ${res.status}`)))),
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
 * How long an answer is reused. Google's photo links carry no documented
 * lifetime, so stay inside the server's own 30 minutes; a tab left open
 * longer asks again rather than showing photos that may have lapsed.
 */
const KEEP_MS = 25 * 60_000

/** Settled answers by `DetailsTarget.key`. Null: nothing known about the place. */
const settled = new Map<string, { at: number; details: PlaceDetails | null }>()

/** What a target's lookup answered in the last while; undefined when it has not settled or has lapsed. */
export function cachedPlaceDetails(target: DetailsTarget, now = Date.now()): PlaceDetails | null | undefined {
  const hit = settled.get(target.key)
  if (!hit) return undefined
  if (now - hit.at < KEEP_MS) return hit.details
  settled.delete(target.key)
  return undefined
}

/** Forget every answer (tests). */
export function clearPlaceDetailsCache() {
  settled.clear()
}

const loadEffect = Effect.fn("PlaceDetails.load")(function* (getToken: GetToken, target: DetailsTarget, signal?: AbortSignal) {
  const google = yield* fromServer(getToken, target, signal)
  // Wikipedia is a fallback: a failure there is "nothing known", not an error.
  const details =
    google ??
    (target.point && !target.business
      ? yield* fromWikipedia(target, signal).pipe(Effect.catchAll(() => Effect.succeed(null)))
      : null)
  // An answer cut short by closing the popover is not an answer to keep.
  if (!signal?.aborted) settled.set(target.key, { at: Date.now(), details })
  return details
})

/**
 * Photos and facts for one idea. Resolves null when nothing is known about the
 * place (the popover shows the idea's own notes); rejects with
 * `PlaceDetailsError` when the server could not be asked (Retry). Each call
 * makes its own requests, so one caller aborting never fails another.
 */
export function loadPlaceDetails(getToken: GetToken, target: DetailsTarget, signal?: AbortSignal): Promise<PlaceDetails | null> {
  const known = cachedPlaceDetails(target)
  if (known !== undefined) return Promise.resolve(known)
  return runPromise(loadEffect(getToken, target, signal))
}
