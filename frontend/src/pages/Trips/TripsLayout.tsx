import { useEffect, type ReactNode } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, Compass, Lock } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react"
import { CLERK_ENABLED } from "@/lib/clerk"
import { ThemeToggle } from "../Korea/ThemeToggle"
import { applyTheme, getInitialTheme } from "../Korea/koreaUtils"
import { SERIF, primaryBtnClass } from "./ui"

const DEV_BEARER: string | null =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEV_BEARER) || null

function TripsAuthGate({ children }: { children: ReactNode }) {
  if (DEV_BEARER) return <>{children}</>
  if (!CLERK_ENABLED) return <>{children}</>
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="flex min-h-[70vh] items-center justify-center px-5 py-16">
          <div className="w-full max-w-md text-center">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200/80 bg-[var(--trips-surface)] text-amber-800 shadow-sm dark:border-stone-800 dark:text-amber-400"
              aria-hidden
            >
              <Compass className="h-7 w-7" strokeWidth={1.5} />
            </div>
            <h1 className="mt-6 font-display text-4xl tracking-tight text-stone-900 dark:text-stone-100" style={SERIF}>
              Trips
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              A private itinerary workspace. Sign in to plan days, reservations, and Map Mode.
            </p>
            <SignInButton mode="modal">
              <button type="button" className={`mt-8 w-full ${primaryBtnClass}`}>
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
  const atIndex = location.pathname === "/trips" || location.pathname === "/trips/"

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  return (
    <div className="trips min-h-screen text-stone-900 dark:text-stone-100">
      <TripsAuthGate>
        <a
          href="#trips-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-amber-800 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-stone-200/60 bg-[color-mix(in_srgb,var(--trips-canvas)_88%,transparent)] backdrop-blur-md dark:border-stone-800/60">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 pt-[env(safe-area-inset-top,0px)]">
            <div className="flex min-w-0 items-center gap-3">
              {!atIndex && (
                <Link
                  to="/trips"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-200/50 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                  aria-label="Back to all trips"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </Link>
              )}
              <Link
                to="/trips"
                className="font-display text-[1.35rem] leading-none tracking-tight text-stone-900 transition hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 dark:text-stone-100 dark:hover:text-amber-400"
                style={SERIF}
              >
                Trips
              </Link>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ThemeToggle />
              {CLERK_ENABLED && !DEV_BEARER ? <UserButton afterSignOutUrl="/" /> : null}
            </div>
          </div>
        </header>
        <main id="trips-main" className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
          <Outlet />
        </main>
      </TripsAuthGate>
    </div>
  )
}
