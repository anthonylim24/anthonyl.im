export const DEFAULT_ROUTE_METADATA = {
  title: 'Anthony Lim - Software Engineer',
  description: 'Anthony Lim - Software Engineer. Ask me anything about my experience, skills, and background.',
  favicon: '/favicon-chat.svg',
  themeColor: 'transparent',
} as const

export const BREATHFLOW_ROUTE_METADATA = {
  title: 'BreathFlow - Scientific Breathwork',
  description: 'BreathFlow is a warm, evidence-informed breathwork app for calm, sleep, focus, recovery, and performance training.',
  favicon: '/favicon-breath.svg',
  themeColor: 'transparent',
} as const

export function getRouteMetadata(pathname: string) {
  return pathname.startsWith('/breathwork')
    ? BREATHFLOW_ROUTE_METADATA
    : DEFAULT_ROUTE_METADATA
}
