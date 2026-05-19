import { useAuth } from '@clerk/clerk-react'
import { CLERK_ENABLED } from './clerk'

/**
 * Safe Clerk JWT-fetcher hook.
 *
 * - When Clerk is enabled (`VITE_CLERK_PUBLISHABLE_KEY` is set at build time
 *   AND `<ClerkProvider>` is mounted), returns the real `useAuth().getToken`.
 * - Otherwise returns a shim that resolves to `null`, so the calling code can
 *   still issue requests (the server will respond 401, which the UI surfaces).
 *
 * Calling `useAuth()` outside a `<ClerkProvider>` throws synchronously during
 * render — which is what was breaking the Ingest / Places pages on builds
 * without a Clerk key. `CLERK_ENABLED` is a module-level constant derived
 * from a Vite env var at build time, so the conditional hook order is stable
 * across renders (React's rules-of-hooks invariant holds).
 */
export function useGetToken(): () => Promise<string | null> {
  if (!CLERK_ENABLED) {
    return noopGetToken
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuth().getToken
}

const noopGetToken = async (): Promise<string | null> => null
