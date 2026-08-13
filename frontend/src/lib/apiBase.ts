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
 * Fetch an `/api/...` path. Preview builds first try
 * `/preview/pr/<n>/api/...`. If production Hono has not mounted the
 * preview-API proxy yet (no `X-Preview-API` header, 404), fall back to
 * production `/api` so the UI still works.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const rewritten = apiUrl(path)
  const res = await fetch(rewritten, init)
  if (!previewApiBase() || rewritten === path) return res
  if (res.headers.get(PREVIEW_API_HEADER) === "1") return res
  if (res.status === 404) return fetch(path, init)
  return res
}
