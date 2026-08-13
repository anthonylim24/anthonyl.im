/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_API_BASE?: string
  readonly VITE_ENABLE_SERVICE_WORKER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
