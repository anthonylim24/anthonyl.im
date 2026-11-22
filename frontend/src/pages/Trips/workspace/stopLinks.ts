import { LIMITS } from "../limits"

// A stop's links (the Instagram post it came from, a Maps link, a menu):
// shown by the site they go to, opened in a new tab, and only ever https.
// Anything else (http, javascript:, data:, a typo) is never made clickable.

export interface StopLink {
  href: string
  /** "Instagram", "Google Maps", or the bare host ("tabelog.com"). */
  label: string
}

/** Sites people recognise by name rather than by host. */
const SITES: ReadonlyArray<{ test: (url: URL) => boolean; label: string }> = [
  { test: (u) => host(u) === "instagram.com", label: "Instagram" },
  {
    test: (u) =>
      host(u) === "maps.app.goo.gl" ||
      host(u).startsWith("maps.google.") ||
      (host(u) === "goo.gl" && u.pathname.startsWith("/maps")) ||
      (/^google\.[a-z.]+$/.test(host(u)) && u.pathname.startsWith("/maps")),
    label: "Google Maps",
  },
  { test: (u) => host(u) === "maps.apple.com", label: "Apple Maps" },
  { test: (u) => host(u) === "map.naver.com" || host(u) === "naver.me", label: "Naver Map" },
  { test: (u) => host(u) === "map.kakao.com" || host(u) === "place.map.kakao.com", label: "Kakao Map" },
  { test: (u) => host(u) === "tiktok.com" || host(u) === "vm.tiktok.com", label: "TikTok" },
  { test: (u) => host(u) === "youtube.com" || host(u) === "youtu.be" || host(u) === "m.youtube.com", label: "YouTube" },
]

/** The host without a leading "www.". */
function host(url: URL): string {
  return url.hostname.replace(/^www\./, "")
}

function parseHttps(text: string): URL | null {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  // A host with a dot: "https://localhost" or "https://intranet" is not a link to a place.
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null
  return url
}

/** A saved link as something to click, or null when it is not an https link. */
export function stopLink(raw: string): StopLink | null {
  const url = parseHttps(raw.trim())
  if (!url) return null
  return { href: url.href, label: SITES.find((site) => site.test(url))?.label ?? host(url) }
}

/** Schemes that are never a web page; refused rather than read as "https://javascript:…". */
const NOT_WEB = /^(javascript|data|vbscript|file|blob|about|mailto|tel|sms|ftp):/i

/**
 * What the traveller typed, as a link to save: "tabelog.com/…" gains
 * https://, anything that is not an https web address is refused (null).
 */
export function normalizeLink(text: string): string | null {
  const typed = text.trim()
  if (!typed || /\s/.test(typed) || NOT_WEB.test(typed)) return null
  const url = parseHttps(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`)
  if (!url || url.href.length > LIMITS.link) return null
  return url.href
}

/** Add a link once, up to the limit; the list unchanged when it can't take it. */
export function withLink(links: readonly string[] | undefined, link: string): string[] {
  const list = links ?? []
  if (list.includes(link) || list.length >= LIMITS.links) return [...list]
  return [...list, link]
}
