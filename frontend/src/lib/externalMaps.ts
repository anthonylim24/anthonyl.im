/** Build an Apple Maps or Google Maps URL from a place. */

export type ExternalMapsApp = "apple" | "google"

export interface ExternalMapsTarget {
  name?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  mapsUrl?: string | null
}

export interface ExternalMapsLink {
  href: string
  app: ExternalMapsApp
  label: string
}

const APPLE_UA = /iPhone|iPad|iPod|Macintosh/
const WINDOWS_UA = /Windows/

export function prefersAppleMaps(userAgent: string): boolean {
  return APPLE_UA.test(userAgent) && !WINDOWS_UA.test(userAgent)
}

export function externalMapsApp(userAgent: string): ExternalMapsApp {
  return prefersAppleMaps(userAgent) ? "apple" : "google"
}

export function externalMapsAppName(app: ExternalMapsApp): string {
  return app === "apple" ? "Apple Maps" : "Google Maps"
}

function currentUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

function safeHttpsUrl(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function isMapsHost(href: string, hosts: readonly string[]): boolean {
  try {
    return hosts.includes(new URL(href).hostname.toLowerCase())
  } catch {
    return false
  }
}

function isGoogleMapsUrl(href: string): boolean {
  try {
    const url = new URL(href)
    if (url.protocol !== "https:") return false
    const host = url.hostname.toLowerCase()
    if (host === "maps.google.com" || host === "www.maps.google.com") return true
    return (host === "google.com" || host === "www.google.com") && url.pathname.startsWith("/maps")
  } catch {
    return false
  }
}

function isSupportedMapsUrl(href: string): boolean {
  return isMapsHost(href, ["maps.apple.com"]) || isGoogleMapsUrl(href)
}

function mapsAppFromHref(href: string): ExternalMapsApp {
  return isMapsHost(href, ["maps.apple.com"]) ? "apple" : "google"
}

function coords(target: ExternalMapsTarget): { lat: number; lng: number } | undefined {
  const { lat, lng } = target
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  return { lat, lng }
}

function searchQuery(target: ExternalMapsTarget): string | undefined {
  const name = target.name?.trim()
  const address = target.address?.trim()
  if (name && address) return `${name}, ${address}`
  return name || address || undefined
}

function displayName(target: ExternalMapsTarget): string {
  return target.name?.trim() || target.address?.trim() || "this place"
}

export function externalMapsHref(target: ExternalMapsTarget, userAgent = currentUserAgent()): string | undefined {
  const app = externalMapsApp(userAgent)
  const pin = coords(target)
  const query = searchQuery(target)
  const existing = safeHttpsUrl(target.mapsUrl)

  if (app === "apple") {
    if (pin) {
      const q = query ?? `${pin.lat},${pin.lng}`
      return `https://maps.apple.com/?ll=${pin.lat},${pin.lng}&q=${encodeURIComponent(q)}`
    }
    if (query) return `https://maps.apple.com/?q=${encodeURIComponent(query)}`
    return existing && isSupportedMapsUrl(existing) ? existing : undefined
  }

  if (existing && isGoogleMapsUrl(existing)) return existing
  if (pin) return `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`
  if (query) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  return existing && isSupportedMapsUrl(existing) ? existing : undefined
}

export function externalMapsLink(
  target: ExternalMapsTarget,
  userAgent = currentUserAgent(),
): ExternalMapsLink | undefined {
  const href = externalMapsHref(target, userAgent)
  if (!href) return undefined
  const app = mapsAppFromHref(href)
  return {
    href,
    app,
    label: `Open ${displayName(target)} in ${externalMapsAppName(app)}`,
  }
}

export type TravelMode = "walk" | "transit" | "drive" | "bike"

export interface DirectionsRequest {
  destination: ExternalMapsTarget
  /** Where to start; the phone's own location when absent. */
  origin?: ExternalMapsTarget
  /** Stops on the way, in order (route the day). Google Maps takes up to 9. */
  waypoints?: readonly ExternalMapsTarget[]
  mode?: TravelMode
}

const GOOGLE_MODE: Record<TravelMode, string> = { walk: "walking", transit: "transit", drive: "driving", bike: "bicycling" }
const APPLE_MODE: Record<TravelMode, string | undefined> = { walk: "w", transit: "r", drive: "d", bike: undefined }
/** Google Maps URLs keep at most nine waypoints; more are dropped from the middle of the list's end. */
export const MAX_WAYPOINTS = 9

/** "lat,lng" when the target is pinned, else its name and address for a search. */
function placeParam(target: ExternalMapsTarget): string | undefined {
  const pin = coords(target)
  if (pin) return `${pin.lat},${pin.lng}`
  return searchQuery(target)
}

/**
 * Turn-by-turn directions in the traveller's maps app: Apple Maps on Apple
 * devices for a single leg, Google Maps otherwise and for any route with
 * stops on the way (Apple's URL scheme has no waypoints). Undefined when the
 * destination has neither a pin nor a name.
 */
export function directionsLink(request: DirectionsRequest, userAgent = currentUserAgent()): ExternalMapsLink | undefined {
  const destination = placeParam(request.destination)
  if (!destination) return undefined
  const origin = request.origin ? placeParam(request.origin) : undefined
  const mode = request.mode ?? "transit"
  const waypoints = (request.waypoints ?? []).map(placeParam).filter((w): w is string => Boolean(w)).slice(0, MAX_WAYPOINTS)
  const name = displayName(request.destination)

  if (externalMapsApp(userAgent) === "apple" && waypoints.length === 0) {
    const params = new URLSearchParams({ daddr: destination })
    if (origin) params.set("saddr", origin)
    const flag = APPLE_MODE[mode]
    if (flag) params.set("dirflg", flag)
    return { href: `https://maps.apple.com/?${params.toString()}`, app: "apple", label: `Directions to ${name} in Apple Maps` }
  }

  const params = new URLSearchParams({ api: "1", destination, travelmode: GOOGLE_MODE[mode] })
  if (origin) params.set("origin", origin)
  // Google ignores waypoints on transit routes.
  if (waypoints.length && mode !== "transit") params.set("waypoints", waypoints.join("|"))
  return { href: `https://www.google.com/maps/dir/?${params.toString()}`, app: "google", label: `Directions to ${name} in Google Maps` }
}
