/** Optional prefix for remote PR previews (`/preview/pr/<n>`). Empty in
 *  production and local Vite, so `/api/*` stays same-origin. */
export function previewApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE
  if (typeof raw !== "string") return ""
  return raw.replace(/\/+$/, "")
}

/** Rewrite `/api/...` onto the preview API mount when `VITE_API_BASE` is set.
 *  Idempotent if the path is already prefixed. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  const base = previewApiBase()
  if (!base) return p
  if (p === base || p.startsWith(`${base}/`)) return p
  return `${base}${p}`
}

export const PREVIEW_API_HEADER = "X-Preview-API"

/**
 * Fetch an `/api/...` path. Preview builds call
 * `/preview/pr/<n>/api/...` only — they must not fall back to production
 * `/api`, which would send a same-origin Clerk cookie to live data.
 * Sidecar 3xx responses are not followed (the proxy already uses
 * `redirect: "manual"`); a Location of `/api/...` would otherwise leak
 * the session to production.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path)
  if (!previewApiBase()) return fetch(url, init)
  return fetch(url, { ...init, redirect: "manual" })
}
