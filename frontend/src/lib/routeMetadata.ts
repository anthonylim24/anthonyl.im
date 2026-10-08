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
  description: 'Research-backed breathing, paced by a hand-painted cat that breathes with you.',
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

export function getRouteMetadata(pathname: string) {
  const appPath = pathname.replace(/^\/preview\/pr\/\d+(?=\/|$)/, "") || "/"
  if (appPath === "/") return LANDING_ROUTE_METADATA
  return appPath.startsWith("/breathwork")
    ? BREATHFLOW_ROUTE_METADATA
    : DEFAULT_ROUTE_METADATA
}
