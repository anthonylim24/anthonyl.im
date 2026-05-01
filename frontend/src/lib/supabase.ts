import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface SupabaseEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

interface SupabaseConfig {
  url: string
  anonKey: string
}

export function getSupabaseConfig(env: SupabaseEnv = import.meta.env): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    return null
  }

  return { url, anonKey }
}

export function createClerkSupabaseClient(
  session: { getToken: () => Promise<string | null> },
  env: SupabaseEnv = import.meta.env,
): SupabaseClient | null {
  const config = getSupabaseConfig(env)

  if (!config) {
    return null
  }

  return createClient(config.url, config.anonKey, {
    async accessToken() {
      return (await session.getToken()) ?? null
    },
  })
}
