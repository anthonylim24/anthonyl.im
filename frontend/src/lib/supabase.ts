import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export function createClerkSupabaseClient(
  session: { getToken: () => Promise<string | null> },
) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    async accessToken() {
      return (await session.getToken()) ?? null
    },
  })
}
