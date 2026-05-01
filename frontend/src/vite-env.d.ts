/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
