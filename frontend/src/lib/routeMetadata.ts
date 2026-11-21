export const DEFAULT_ROUTE_METADATA = {
  title: "Lim — Ask Anthony Lim's AI",
  description: 'Meet Lim, a squishy jelly who answers for Anthony Lim. Ask about his work, projects, and engineering background.',
  favicon: '/favicon-chat.svg',
} as const

export const LANDING_ROUTE_METADATA = {
  title: 'anthonyl.im — Applied intelligence lab',
  description: 'Frontier models and the agents that put them to work — they plan before they act, stay inside the bounds you set, and verify every step.',
  favicon: '/favicon-lim.svg',
} as const

export const BREATHFLOW_ROUTE_METADATA = {
  title: 'BreathFlow — Guided breathing with a watercolour cat',
  // Same text as appPreviews.breathwork in server/src/shellMeta.ts (the injected preview tags).
  description: 'Research-backed breathing — box breathing, cyclic sighing, 4-7-8, resonance and more — paced by a hand-painted cat that breathes with you.',
  favicon: '/favicon-breath.svg',
} as const

/** Tab titles for BreathFlow's inner pages (Home keeps the full title). */
const BREATHFLOW_PAGES: Record<string, string> = {
  '/breathwork/session': 'Breathe',
  '/breathwork/progress': 'Progress',
  '/breathwork/settings': 'Settings',
}

export function breathflowTitle(pathname: string) {
  const page = BREATHFLOW_PAGES[pathname.replace(/\/+$/, '')]
  return page ? `${page} · BreathFlow` : BREATHFLOW_ROUTE_METADATA.title
}

const PREVIEW_BASE = /^\/preview\/pr\/\d+(?=\/|$)/

/**
 * The web app manifest for a path (the preview base, if any, stays on).
 * Every trip installs as "Trips" but the Korea trip, which keeps its own;
 * elsewhere it stays Korea's, out of scope. Same choice as
 * `manifestForPath` in server/src/shellMeta.ts and index.html's korea script.
 */
export function manifestForPath(pathname: string): string {
  const base = pathname.match(PREVIEW_BASE)?.[0] ?? ''
  const appPath = pathname.slice(base.length) || '/'
  const korea = appPath.startsWith('/korea') || appPath.startsWith('/trips/korea-2026')
  return `${base}${appPath.startsWith('/trips') && !korea ? '/trips.webmanifest' : '/korea.webmanifest'}`
}

/**
 * Point the page's manifest link at `manifestForPath(pathname)` after a
 * client-side navigation (`/trips` → `/trips/korea-2026`), so an install
 * from there gets that app. `pathname` is the full path, preview base included.
 */
export function syncManifest(pathname: string, doc: Document = document): void {
  const link = doc.querySelector('link[rel="manifest"]')
  const href = manifestForPath(pathname)
  if (link && link.getAttribute('href') !== href) link.setAttribute('href', href)
}

export function getRouteMetadata(pathname: string) {
  const appPath = pathname.replace(/^\/preview\/pr\/\d+(?=\/|$)/, "") || "/"
  if (appPath === "/lab") return LANDING_ROUTE_METADATA
  return appPath.startsWith("/breathwork")
    ? BREATHFLOW_ROUTE_METADATA
    : DEFAULT_ROUTE_METADATA
}
