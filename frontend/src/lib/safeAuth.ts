import { useAuth } from '@clerk/clerk-react'
import { CLERK_ENABLED } from './clerk'

/**
 * Safe Clerk JWT-fetcher hook.
 *
 * - When Clerk is enabled (`VITE_CLERK_PUBLISHABLE_KEY` is set at build time
 *   AND `<ClerkProvider>` is mounted), returns the real `useAuth().getToken`.
 * - Otherwise returns a shim that resolves to `null`. Callers should check
 *   `clerkEnabled` from this module FIRST and skip the network entirely when
 *   it's false — otherwise the request fires without an Authorization header
 *   and the server returns 401, which looks like a transient failure even
 *   though it's a permanent build-config issue.
 *
 * Calling `useAuth()` outside a `<ClerkProvider>` throws synchronously during
 * render. `CLERK_ENABLED` is a module-level constant derived from a Vite env
 * var at build time, so the conditional hook order is stable across renders
 * (React's rules-of-hooks invariant holds).
 */
export function useGetToken(): () => Promise<string | null> {
  if (!CLERK_ENABLED) {
    return noopGetToken
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuth().getToken
}

const noopGetToken = async (): Promise<string | null> => null

/**
 * Whether this build has Clerk auth wired up. False = the build was made
 * without `VITE_CLERK_PUBLISHABLE_KEY`, so no Authorization header can be
 * generated. Re-exported for pages that need to render a config-issue
 * banner instead of polling endpoints that will always 401.
 */
export const clerkEnabled = CLERK_ENABLED
