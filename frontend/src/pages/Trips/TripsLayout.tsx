import { lazy, Suspense, useEffect, type ReactNode } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, Compass, Lock } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react"
import { CLERK_ENABLED } from "@/lib/clerk"
import { ThemeToggle } from "../Korea/ThemeToggle"
import { applyTheme, getInitialTheme } from "../Korea/koreaUtils"
import {
  accentIconClass,
  chromeHeaderClass,
  focusRingClass,
  iconBtnClass,
  mutedInkClass,
  primaryBtnClass,
  wrapAnywhereClass,
} from "./ui"

const TripChat = lazy(() => import("./TripChat").then((m) => ({ default: m.TripChat })))

const DEV_BEARER: string | null =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEV_BEARER) || null

function TripsAuthGate({ children }: { children: ReactNode }) {
  if (DEV_BEARER) return <>{children}</>
  if (!CLERK_ENABLED) return <>{children}</>
  return <ClerkTripsGate>{children}</ClerkTripsGate>
}

function ClerkTripsGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()
  if (!isLoaded) {
    return (
      <div
        className="flex min-h-[70dvh] items-center justify-center px-5 py-16 text-stone-500 dark:text-stone-400"
        role="status"
        aria-label="Checking sign-in"
      >
        <span className="text-sm">Loading…</span>
      </div>
    )
  }
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="flex min-h-[70dvh] items-center justify-center px-5 py-16">
          <div className="w-full max-w-md text-center">
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200/80 bg-[var(--trips-surface)] shadow-sm dark:border-stone-800 ${accentIconClass}`}
              aria-hidden
            >
              <Compass className="h-7 w-7" strokeWidth={1.5} />
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Trips
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              A private itinerary workspace. Sign in to plan days, reservations, and Map Mode.
            </p>
            <SignInButton mode="modal">
              <button type="button" className={`mt-8 w-full ${primaryBtnClass}`}>
                <Lock className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Sign in to continue
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </>
  )
}

/** Concierge FAB pad: `/trips/:id` and `/trips/:id/day/:dayId` only.
 *  Index, create, places, and edit must not grow the extra bottom inset. */
function isTripChatPad(pathname: string): boolean {
  const segs = pathname.replace(/\/+$/, "").split("/").filter(Boolean)
  if (segs[0] !== "trips" || !segs[1] || segs[1] === "new") return false
  if (segs.length === 2) return true
  return segs.length === 4 && segs[2] === "day"
}

/** Slug from the URL, no fetch. `korea-2026` → `Korea 2026`. */
function tripCrumbFromPath(pathname: string): string | null {
  const segs = pathname.replace(/\/+$/, "").split("/").filter(Boolean)
  if (segs[0] !== "trips" || !segs[1] || segs[1] === "new") return null
  return decodeURIComponent(segs[1])
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ")
}

export function TripsLayout() {
  const location = useLocation()
  const atIndex = location.pathname === "/trips" || location.pathname === "/trips/"
  const chatPad = isTripChatPad(location.pathname)
  const crumb = tripCrumbFromPath(location.pathname)

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  return (
    <div className="trips min-h-dvh text-stone-900 dark:text-stone-100">
      <TripsAuthGate>
        <a
          href="#trips-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-[color:var(--trips-accent)] focus:px-4 focus:text-sm focus:font-medium focus:text-white dark:focus:text-stone-950"
        >
          Skip to content
        </a>
        <header className={chromeHeaderClass}>
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top,0px)] sm:h-12 sm:px-6">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {!atIndex && (
                <Link to="/trips" className={iconBtnClass} aria-label="Back to all trips">
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </Link>
              )}
              <ol className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <li className="shrink-0">
                  <Link
                    to="/trips"
                    className={`-mx-1.5 inline-flex min-h-11 items-center rounded-lg px-1.5 text-[15px] font-semibold tracking-tight text-stone-900 transition hover:text-[color:var(--trips-accent)] dark:text-stone-100 ${focusRingClass}`}
                  >
                    Trips
                  </Link>
                </li>
                {crumb ? (
                  <li
                    aria-current="page"
                    className={`flex min-w-0 items-center gap-1.5 sm:gap-2 ${mutedInkClass}`}
                  >
                    <span aria-hidden className="text-stone-300 dark:text-stone-600">
                      /
                    </span>
                    <span className={`truncate text-sm font-medium ${wrapAnywhereClass}`}>{crumb}</span>
                  </li>
                ) : null}
              </ol>
            </nav>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* ThemeToggle is already 44×44; keep the trip-tap wrapper for header rhythm. */}
              <span className="trip-tap-44 inline-flex">
                <ThemeToggle />
              </span>
              {CLERK_ENABLED && !DEV_BEARER ? <UserButton afterSignOutUrl="/" /> : null}
            </div>
          </div>
        </header>
        {/* Each routed page owns its own gutters. No full-bleed bloom heroes. */}
        <main
          id="trips-main"
          tabIndex={-1}
          className={`${chatPad ? "px-0 pb-28" : "px-0 pb-10 sm:pb-14"} outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--trips-accent)]`}
        >
          <Outlet />
        </main>
        <Suspense fallback={null}>
          <TripChat />
        </Suspense>
      </TripsAuthGate>
    </div>
  )
}
