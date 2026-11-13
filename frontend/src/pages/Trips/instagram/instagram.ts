import { centroid, distanceMeters, isLocated, type LngLat } from "../map/geo"
import { makeItem } from "../tripEdits"
import type { ItineraryItem, Trip, TripDay, TripLocation } from "../types"
import type { IgJob, IgPlace } from "./instagramApi"

// Pure rules for the Instagram import: recognising links, reading a job's
// progress, choosing a day for a place, and turning a place into a stop.

const IG_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"])

export function isInstagramUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return (url.protocol === "https:" || url.protocol === "http:") && IG_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Every Instagram link in a blob of pasted text, in order, without repeats. */
export function extractInstagramUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of found) {
    const url = raw.replace(/[),.;!?]+$/, "")
    if (!isInstagramUrl(url)) continue
    const key = postKey(url)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(url)
  }
  return out
}

/** Host + path, so the same post with different tracking params matches. */
export function postKey(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname.replace(/^\/share\//, "/").replace(/\/+$/, "").toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

/** "reel/Cabc123" → what to call a post before its author is known. */
export function postLabel(job: Pick<IgJob, "url" | "post_preview">): string {
  const owner = job.post_preview?.owner_username?.trim()
  // The fallback fetcher only knows the account's numeric id: not a name.
  if (owner && !/^\d+$/.test(owner)) return `@${owner.replace(/^@/, "")}`
  return /\/reels?\//i.test(job.url) ? "Instagram Reel" : "Instagram post"
}

export type JobPhase = "working" | "done" | "empty" | "failed"

export interface JobProgress {
  phase: JobPhase
  /** 0–1 along the pipeline; 1 when finished. */
  fraction: number
  label: string
  /** Shown under a failed job. */
  problem?: string
}

const STEP_AT: Record<string, number> = {
  queued: 0.05,
  fetching: 0.22,
  bundling: 0.46,
  extracting: 0.72,
  geocoding: 0.88,
  saving: 0.96,
  done: 1,
}

function stepLabel(job: IgJob): string {
  switch (job.step) {
    case "fetching":
      return "Opening the post"
    case "bundling":
      return job.skip_video ? "Reading the caption" : "Watching the video"
    case "extracting":
      return "Finding the places"
    case "geocoding":
      return "Pinning them on the map"
    case "saving":
      return "Almost there"
    default:
      return "In the queue"
  }
}

/** A plain-language reason for a job that will not finish. */
/** The server's own access to Instagram is broken: retrying cannot help. */
const OFFLINE = /\b(401|403)\b|token expired|auth failed|unauthori[sz]ed/i

export function describeProblem(error: string | null): string {
  const text = error ?? ""
  if (OFFLINE.test(text)) return "Instagram import is offline right now. It needs attention on the server, so trying again won’t help yet."
  if (/empty array|not found|404|private|login/i.test(text)) {
    return "Instagram wouldn’t open this post. It may be private or deleted."
  }
  if (/BRIGHT_DATA|not configured|missing .*key/i.test(text)) return "Import isn’t fully set up on this server yet."
  if (/rate|429|quota/i.test(text)) return "Too many posts at once. Give it a minute, then try again."
  if (/timeout|timed out|stale/i.test(text)) return "The post took too long to read."
  return "This post couldn’t be read."
}

export function jobProgress(job: IgJob): JobProgress {
  if (job.status === "done" || job.step === "done") {
    return job.places.length > 0
      ? { phase: "done", fraction: 1, label: `${job.places.length} ${job.places.length === 1 ? "place" : "places"}` }
      : { phase: "empty", fraction: 1, label: "No places found" }
  }
  if (job.status === "dead" || job.status === "failed") {
    return { phase: "failed", fraction: 1, label: "Couldn’t read it", problem: describeProblem(job.last_error) }
  }
  // A rejected server key fails every retry: say so now, not after the backoff.
  if (job.last_error && OFFLINE.test(job.last_error)) {
    return { phase: "failed", fraction: 1, label: "Import is offline", problem: describeProblem(job.last_error) }
  }
  // Waiting out a backoff after an error: still working, and say so.
  if (job.status === "pending" && job.last_error && job.attempts > 0) {
    return { phase: "working", fraction: STEP_AT[job.step] ?? 0.05, label: "Instagram didn’t answer. Trying again" }
  }
  return { phase: "working", fraction: STEP_AT[job.step] ?? 0.05, label: stepLabel(job) }
}

export const isLive = (job: IgJob) => jobProgress(job).phase === "working"

/** Extractor categories → the categories the itinerary knows. */
export function placeCategory(category: string | null | undefined): string | undefined {
  switch (category) {
    case "restaurant":
    case "cafe":
    case "bar":
    case "shopping":
    case "hotel":
    case "landmark":
      return category
    case "activity":
      return "experience"
    default:
      return undefined
  }
}

const key = (name: string) => name.trim().toLowerCase()

/** Names a place can go by on the trip: local, romanized, and the stop title built from both. */
function namesOf(place: Pick<IgPlace, "name" | "name_romanized">): string[] {
  const romanized = place.name_romanized?.trim()
  return [place.name, romanized ?? "", romanized ? `${place.name} (${romanized})` : ""].filter(Boolean).map(key)
}

/** The day (1-based) that already has this place, or null. */
export function dayWithPlace(trip: Pick<Trip, "days">, place: Pick<IgPlace, "name" | "name_romanized" | "lat" | "lng">): number | null {
  const names = new Set(namesOf(place))
  for (let i = 0; i < trip.days.length; i++) {
    const hit = trip.days[i]!.items.some((item) => {
      if (item.kind !== "place" && item.kind !== "reservation") return false
      if (names.has(key(item.title)) || names.has(key(item.location?.name ?? ""))) return true
      // Same spot under another spelling.
      return (
        place.lat != null &&
        place.lng != null &&
        item.location?.lat != null &&
        item.location?.lng != null &&
        distanceMeters({ lat: place.lat, lng: place.lng }, { lat: item.location.lat, lng: item.location.lng }) < 25
      )
    })
    if (hit) return i + 1
  }
  return null
}

/** How far a place may be from a day's stops and still "belong" to it. */
const SAME_AREA_M = 60_000

/**
 * The day a place fits best: the one whose pinned stops are nearest. With no
 * pinned stops anywhere near, the emptiest day wins (earliest on a tie), so
 * a fresh trip fills from day 1.
 */
export function bestDayFor(trip: Pick<Trip, "days">, place: { lat: number | null; lng: number | null }): TripDay | undefined {
  if (trip.days.length === 0) return undefined
  if (place.lat != null && place.lng != null) {
    const at: LngLat = { lat: place.lat, lng: place.lng }
    let best: TripDay | undefined
    let bestMeters = SAME_AREA_M
    for (const day of trip.days) {
      const center = centroid(day.items.filter(isLocated).map((i) => ({ lat: i.location.lat, lng: i.location.lng })))
      if (!center) continue
      const meters = distanceMeters(at, center)
      if (meters < bestMeters) {
        bestMeters = meters
        best = day
      }
    }
    if (best) return best
  }
  return [...trip.days].sort((x, y) => x.items.length - y.items.length)[0]
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** A place from a post as an itinerary stop. The post link rides along in `links`. */
export function stopFromPlace(place: IgPlace, postUrl?: string): ItineraryItem {
  const romanized = place.name_romanized?.trim()
  const title = romanized && key(romanized) !== key(place.name) ? `${place.name} (${romanized})` : place.name
  const location: TripLocation = { name: place.name, source: "user" }
  if (place.address) location.address = place.address
  if (typeof place.lat === "number" && typeof place.lng === "number") {
    location.lat = place.lat
    location.lng = place.lng
  }
  const category = placeCategory(place.category)
  if (category) location.category = category
  if (place.google_place_id) location.placeId = place.google_place_id
  location.confidence = place.geocode_disagree ? "low" : place.confidence_band
  const quote = place.supporting_quote?.replace(/\s+/g, " ").trim()
  return {
    ...makeItem("place", title),
    notes: quote ? clip(quote, 220) : undefined,
    links: postUrl ? [postUrl] : undefined,
    location,
  }
}

/** "Belém, Lisbon" — the line under a place's name. */
export function placeWhere(place: Pick<IgPlace, "address" | "city">): string {
  const address = place.address?.trim()
  if (address) return address
  return place.city?.trim() ?? ""
}
