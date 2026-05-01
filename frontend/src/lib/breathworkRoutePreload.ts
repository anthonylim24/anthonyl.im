export const loadHomePage = () => import('@/pages/Home')
export const loadSessionPage = () => import('@/pages/Session')
export const loadProgressPage = () => import('@/pages/Progress')
export const loadSettingsPage = () => import('@/pages/Settings')
export const loadBreathworkNotFoundPage = () => import('@/pages/BreathworkNotFound')

const breathworkRoutePreloaders = {
  '/breathwork': loadHomePage,
  '/breathwork/session': loadSessionPage,
  '/breathwork/progress': loadProgressPage,
  '/breathwork/settings': loadSettingsPage,
} as const

type PreloadableBreathworkPath = keyof typeof breathworkRoutePreloaders

const preloadedRoutes = new Set<PreloadableBreathworkPath>()

function isPreloadableBreathworkPath(path: string): path is PreloadableBreathworkPath {
  return path in breathworkRoutePreloaders
}

export function preloadBreathworkRoute(path: string): void {
  if (!isPreloadableBreathworkPath(path)) return
  if (preloadedRoutes.has(path)) return

  preloadedRoutes.add(path)
  void breathworkRoutePreloaders[path]().catch(() => {
    preloadedRoutes.delete(path)
  })
}
