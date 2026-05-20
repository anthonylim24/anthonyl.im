import { useAuth } from '@clerk/clerk-react'
import { CLERK_ENABLED } from './clerk'

/**
 * Frontend dev-bearer escape hatch. When the build is made with
 * `VITE_DEV_BEARER` set, the `useGetToken` hook hands out that bearer
 * instead of going through Clerk. The backend's `IG_DEV_BEARER` env var
 * must be set to the same value — the existing clerkAuth middleware
 * accepts any token matching IG_DEV_BEARER as a real authed request
 * with userId = IG_DEV_USER_ID (default "dev-user").
 *
 * Dev bearer takes precedence over Clerk when both are configured, so
 * automated testing can short-circuit interactive sign-in without
 * touching the Clerk env vars. Keep VITE_DEV_BEARER unset (and
 * IG_DEV_BEARER unset on the server) in production deploys.
 */
const DEV_BEARER: string | null =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEV_BEARER) || null

/**
 * Safe Clerk JWT-fetcher hook.
 *
 * Resolution order:
 *   1. `VITE_DEV_BEARER` set → return that bearer (dev/test escape hatch)
 *   2. Clerk enabled → real `useAuth().getToken`
 *   3. Neither → no-op that resolves to `null`
 *
 * Calling `useAuth()` outside a `<ClerkProvider>` throws synchronously
 * during render. `CLERK_ENABLED` is a module-level constant derived from
 * a Vite env var at build time, so the conditional hook order is stable
 * across renders (React's rules-of-hooks invariant holds).
 */
export function useGetToken(): () => Promise<string | null> {
  if (DEV_BEARER) {
    return devGetToken
  }
  if (!CLERK_ENABLED) {
    return noopGetToken
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAuth().getToken
}

const noopGetToken = async (): Promise<string | null> => null
const devGetToken = async (): Promise<string | null> => DEV_BEARER

/**
 * Whether this build has SOME form of auth wired up. True when a dev
 * bearer is configured OR Clerk is enabled. Pages use this to decide
 * whether to fire authed network calls or render a config-issue banner.
 */
export const clerkEnabled = DEV_BEARER !== null || CLERK_ENABLED
