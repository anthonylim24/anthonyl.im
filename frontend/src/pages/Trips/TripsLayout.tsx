import type { ReactNode } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { Lock, Map as MapIcon } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react"
import { CLERK_ENABLED } from "@/lib/clerk"

const DEV_BEARER: string | null =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEV_BEARER) || null

// Sign-in gate for /trips. Mirrors KoreaAuthGate's pass-through rules:
// VITE_DEV_BEARER bypasses Clerk for local automation, and builds without
// Clerk render ungated.
function TripsAuthGate({ children }: { children: ReactNode }) {
  if (DEV_BEARER) return <>{children}</>
  if (!CLERK_ENABLED) return <>{children}</>
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center px-5">
          <div className="w-full max-w-md rounded-3xl border border-stone-200/70 bg-white/80 p-8 text-center shadow-xl backdrop-blur-xl dark:border-stone-800/70 dark:bg-stone-900/70">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-3xl shadow-inner dark:bg-amber-950/60"
              aria-hidden
            >
              <MapIcon className="h-8 w-8 text-amber-700 dark:text-amber-400" />
            </div>
            <h1
              className="mt-5 font-serif text-3xl text-stone-900 dark:text-stone-100"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Trip Planner
            </h1>
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
              Sign in to create, plan, and enhance your trips.
            </p>
            <SignInButton mode="modal">
              <button
                type="button"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                <Lock className="h-4 w-4" aria-hidden />
                Sign in to continue
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </>
  )
}

export function TripsLayout() {
  const location = useLocation()
  const atIndex = location.pathname === "/trips"
  return (
    <div className="trips min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <TripsAuthGate>
        <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/85">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link
              to="/trips"
              className="font-serif text-xl text-stone-900 transition hover:text-amber-700 dark:text-stone-100 dark:hover:text-amber-400"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Trips
            </Link>
            <div className="flex items-center gap-3">
              {!atIndex && (
                <Link
                  to="/trips"
                  className="rounded-full px-3 py-1.5 text-sm text-stone-600 transition hover:bg-stone-200/60 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                >
                  All trips
                </Link>
              )}
              {CLERK_ENABLED && !DEV_BEARER ? <UserButton afterSignOutUrl="/" /> : null}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">
          <Outlet />
        </main>
      </TripsAuthGate>
    </div>
  )
}
