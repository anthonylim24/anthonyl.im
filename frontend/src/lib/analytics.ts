const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

interface PostHogEnv {
  VITE_POSTHOG_KEY?: string
  VITE_POSTHOG_HOST?: string
}

interface AnalyticsPrivacyRuntime {
  doNotTrack?: string | null
  globalPrivacyControl?: boolean
}

export interface PostHogConfig {
  key: string
  apiHost: string
}

function getDefaultPrivacyRuntime(): AnalyticsPrivacyRuntime | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }

  return navigator as AnalyticsPrivacyRuntime
}

export function hasAnalyticsPrivacyOptOut(
  runtime: AnalyticsPrivacyRuntime | undefined = getDefaultPrivacyRuntime()
): boolean {
  if (!runtime) {
    return false
  }

  return runtime.globalPrivacyControl === true || runtime.doNotTrack === '1'
}

export function getPostHogConfig(
  env: PostHogEnv = import.meta.env,
  privacyRuntime?: AnalyticsPrivacyRuntime
): PostHogConfig | null {
  const key = env.VITE_POSTHOG_KEY?.trim()

  if (!key || hasAnalyticsPrivacyOptOut(privacyRuntime)) {
    return null
  }

  return {
    key,
    apiHost: env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
  }
}

// Inflect (marketing analytics). Loaded by the SPA after the page has loaded,
// never on sign-in or Trips: their URLs carry invite tokens and shared links.
const INFLECT_SRC = 'https://www.useinflect.ai/inflect-tracking.js'
const INFLECT_TRACKING_KEY = 'inf_g1QPFf_RBSCCmqq81XE4FLcr7GQdGCMu'
const INFLECT_INSTALL_VERSION = '2026-08-12.1'
const UNTRACKED_PATHS = /^\/(trips|korea|sign-in|sign-up)(\/|$)/

export function shouldLoadInflect(
  pathname: string,
  privacyRuntime: AnalyticsPrivacyRuntime | undefined = getDefaultPrivacyRuntime()
): boolean {
  if (hasAnalyticsPrivacyOptOut(privacyRuntime)) return false
  const appPath = pathname.replace(/^\/preview\/pr\/\d+(?=\/|$)/, '') || '/'
  return !UNTRACKED_PATHS.test(appPath)
}

/** Adds the Inflect script once. Returns whether it was added. */
export function loadInflectTracking(
  doc: Document = document,
  pathname: string = location.pathname,
  privacyRuntime: AnalyticsPrivacyRuntime | undefined = getDefaultPrivacyRuntime()
): boolean {
  if (!shouldLoadInflect(pathname, privacyRuntime)) return false
  if (doc.querySelector(`script[src="${INFLECT_SRC}"]`)) return false
  const script = doc.createElement('script')
  script.src = INFLECT_SRC
  script.async = true
  script.dataset.trackingKey = INFLECT_TRACKING_KEY
  script.dataset.inflectInstallVersion = INFLECT_INSTALL_VERSION
  doc.head.appendChild(script)
  return true
}
