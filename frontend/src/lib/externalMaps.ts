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
    if (existing && isMapsHost(existing, ["maps.apple.com"])) return existing
    return existing
  }

  if (existing && isGoogleMapsUrl(existing)) return existing
  if (pin) return `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`
  if (query) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  return existing
}

export function externalMapsLink(
  target: ExternalMapsTarget,
  userAgent = currentUserAgent(),
): ExternalMapsLink | undefined {
  const href = externalMapsHref(target, userAgent)
  if (!href) return undefined
  const app = externalMapsApp(userAgent)
  return {
    href,
    app,
    label: `Open ${displayName(target)} in ${externalMapsAppName(app)}`,
  }
}
