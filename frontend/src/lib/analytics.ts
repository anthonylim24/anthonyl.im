const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

interface PostHogEnv {
  VITE_POSTHOG_KEY?: string
  VITE_POSTHOG_HOST?: string
}

export interface PostHogConfig {
  key: string
  apiHost: string
}

export function getPostHogConfig(env: PostHogEnv = import.meta.env): PostHogConfig | null {
  const key = env.VITE_POSTHOG_KEY?.trim()

  if (!key) {
    return null
  }

  return {
    key,
    apiHost: env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
  }
}
