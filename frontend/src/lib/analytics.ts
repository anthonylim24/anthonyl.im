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
