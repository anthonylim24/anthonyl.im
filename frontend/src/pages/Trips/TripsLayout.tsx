import { lazy, Suspense, useEffect, type ReactNode } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react"
import { CLERK_ENABLED } from "@/lib/clerk"
import { ThemeToggle } from "../Korea/ThemeToggle"
import { applyTheme, getInitialTheme } from "../Korea/koreaUtils"
import {
  DISPLAY,
  EASE,
  REVEAL_DURATION,
  displayTitleClass,
  focusRingClass,
  ghostBtnClass,
  hoverArrowBackClass,
  mutedInkClass,
  primaryBtnClass,
  revealDelay,
} from "./ui"

const TripChat = lazy(() => import("./TripChat").then((m) => ({ default: m.TripChat })))

const DEV_BEARER: string | null =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEV_BEARER) || null

function TripsAuthGate({ children }: { children: ReactNode }) {
  if (DEV_BEARER) return <>{children}</>
  if (!CLERK_ENABLED) return <>{children}</>
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <SignedOutGate />
      </SignedOut>
    </>
  )
}

export function SignedOutGate() {
  const reduce = useReducedMotion()
  return (
    <div className="mx-auto grid min-h-[70dvh] max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: REVEAL_DURATION, delay: revealDelay(0), ease: EASE }}
        className="aspect-[4/3] overflow-hidden rounded-[var(--tr-r-panel)] bg-[var(--tr-surface)]"
      >
        <img
          src="/media/trip-start.webp"
          alt="A travel-planning desk with unfolded maps, a notebook, and boarding passes under a desk lamp."
          width={1600}
          height={1200}
          className="h-full w-full object-cover"
        />
      </motion.div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: REVEAL_DURATION, delay: revealDelay(2), ease: EASE }}
        className="max-w-md"
      >
        <h1 className={displayTitleClass} style={DISPLAY}>
          Your trips, in one place
        </h1>
        <p className={`mt-4 max-w-[36ch] text-sm leading-relaxed ${mutedInkClass}`}>
          Sign in to plan days, reservations, and Map Mode with the people on the trip.
        </p>
        <SignInButton mode="modal">
          <button type="button" className={`mt-8 ${primaryBtnClass}`}>
            Sign in
          </button>
        </SignInButton>
      </motion.div>
    </div>
  )
}

export function TripsLayout() {
  const location = useLocation()
  const atIndex = location.pathname === "/trips" || location.pathname === "/trips/"
  // Concierge FAB only lives on overview + day pages; keep the extra pad there.
  const chatPad = /\/trips\/(?!new(?:\/|$))[^/]+(?:\/day\/[^/]+)?\/?$/.test(location.pathname)

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  return (
    <div className="trips min-h-dvh">
      <TripsAuthGate>
        <a
          href="#trips-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-[var(--tr-r-control)] focus:bg-[color:var(--ta)] focus:px-4 focus:text-sm focus:font-medium focus:text-[color:var(--ta-ink)]"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-[color:var(--tr-line)] bg-[color-mix(in_srgb,var(--tr-canvas)_88%,transparent)] backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 pt-[env(safe-area-inset-top,0px)]">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {!atIndex && (
                <Link to="/trips" className={`group ${ghostBtnClass}`}>
                  <ArrowLeft className={`h-4 w-4 ${hoverArrowBackClass}`} strokeWidth={1.5} aria-hidden />
                  All trips
                </Link>
              )}
              <Link
                to="/trips"
                className={`-mx-2 inline-flex min-h-11 items-center rounded-[var(--tr-r-control)] px-2 font-display text-[1.35rem] leading-none tracking-tight transition hover:text-[color:var(--ta)] ${focusRingClass}`}
                style={DISPLAY}
              >
                Trips
              </Link>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* The toggle is a 32px control owned by the Korea app; `trip-tap-44`
                  grows its hit area rather than forking the component. */}
              <span className="trip-tap-44 inline-flex">
                <ThemeToggle />
              </span>
              {CLERK_ENABLED && !DEV_BEARER ? <UserButton afterSignOutUrl="/" /> : null}
            </div>
          </div>
        </header>
        {/* Unconstrained so trip-scoped pages can bleed their hero gradient to
            the viewport edge; each routed page owns its own gutters. */}
        <main id="trips-main" className={chatPad ? "px-0 pb-28" : "px-0 pb-10 sm:pb-14"}>
          <Outlet />
        </main>
        <Suspense fallback={null}>
          <TripChat />
        </Suspense>
      </TripsAuthGate>
    </div>
  )
}
