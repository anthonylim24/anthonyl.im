export const DEFAULT_ROUTE_METADATA = {
  title: 'Anthony Lim - Software Engineer',
  description: 'Anthony Lim - Software Engineer. Ask me anything about my experience, skills, and background.',
  favicon: '/favicon-chat.svg',
} as const

export const BREATHFLOW_ROUTE_METADATA = {
  title: 'BreathFlow',
  description: 'Timed breathing protocols with published research.',
  favicon: '/favicon-breath.svg',
} as const

export function getRouteMetadata(pathname: string) {
  const appPath = pathname.replace(/^\/preview\/pr\/\d+(?=\/|$)/, "") || "/"
  return appPath.startsWith("/breathwork")
    ? BREATHFLOW_ROUTE_METADATA
    : DEFAULT_ROUTE_METADATA
}
