import { Suspense, useEffect, useState, type ReactNode } from "react"
import { OverlayBoundary } from "@/components/OverlayBoundary"
import { lazyRetry } from "@/lib/lazyRetry"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, Lock, Plus, RotateCw } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useClerk } from "@clerk/clerk-react"
import { sx } from "@/styles/merge"
import { CLERK_ENABLED } from "@/lib/clerk"
import { useAuthStall, type StallCause } from "@/lib/authStall"
import { ThemeToggle } from "../Korea/ThemeToggle"
import { applyTheme, getInitialTheme } from "../Korea/koreaUtils"
import { a } from "./atlas.stylex"
import { shell as s } from "./index.stylex"

const TripChat = lazyRetry(() => import("./TripChat").then((m) => ({ default: m.TripChat })))

const DEV_BEARER: string | null =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEV_BEARER) || null

function TripsAuthGate({ children }: { children: ReactNode }) {
  if (DEV_BEARER || !CLERK_ENABLED) return <>{children}</>
  return <ClerkTripsGate>{children}</ClerkTripsGate>
}

const stallCopy: Record<StallCause, { title: string; body: string }> = {
  offline: {
    title: "You are offline",
    body: "Trips needs a connection to sign you in. It will carry on by itself once you are back online.",
  },
  site: {
    title: "anthonyl.im is not answering",
    body: "The connection to this site dropped. This page keeps trying and will carry on by itself.",
  },
  auth: {
    title: "Sign-in is not loading",
    body: "Your network may be blocking the sign-in service. This page keeps trying and will carry on by itself; another network or turning off Wi-Fi filtering usually gets through.",
  },
}

/** True once Clerk reports that it could not load. */
function useClerkFailed(): boolean {
  const clerk = useClerk()
  const [failed, setFailed] = useState(clerk.status === "error")
  useEffect(() => {
    const onStatus = (status: string) => setFailed(status === "error")
    clerk.on("status", onStatus, { notify: true })
    return () => clerk.off("status", onStatus)
  }, [clerk])
  return failed
}

function ClerkTripsGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()
  const { stalled, cause } = useAuthStall(isLoaded, useClerkFailed())
  if (!isLoaded) {
    if (stalled && cause) {
      const copy = stallCopy[cause]
      return (
        <div {...sx(s.gate)} role="status" aria-live="polite">
          <div {...sx(s.gateInner)}>
            <CompassMark size={40} />
            <h1 {...sx(a.display, s.gateTitle)}>{copy.title}</h1>
            <p {...sx(a.body)}>{copy.body}</p>
            <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={() => window.location.reload()}>
              <RotateCw size={16} strokeWidth={1.75} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )
    }
    return (
      <div {...sx(s.gate)} role="status" aria-label="Checking sign-in">
        <span {...sx(a.eyebrow)}>Loading…</span>
      </div>
    )
  }
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div {...sx(s.gate)}>
          <div {...sx(s.gateInner)}>
            <CompassMark size={40} />
            <h1 {...sx(a.display, s.gateTitle)}>
              Sign in to <span {...sx(a.italic)}>Trips</span>
            </h1>
            <p {...sx(a.body)}>Your itineraries, maps and bookings stay private to you and the people you invite.</p>
            <SignInButton mode="modal">
              <button type="button" {...sx(a.btn, a.btnPrimary)}>
                <Lock size={16} strokeWidth={1.75} aria-hidden />
                Sign in to continue
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </>
  )
}

/** Eight-point compass rose: the Trips mark. */
export function CompassMark({ size = 22, style }: { size?: number; style?: Parameters<typeof sx>[0] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...sx(style)}>
      <path d="M12 1.5 14 10l8.5 2-8.5 2-2 8.5-2-8.5L1.5 12 10 10Z" fill="currentColor" />
      <path d="m5.6 5.6 4 3.2-.8.8ZM18.4 5.6l-3.2 4-.8-.8ZM18.4 18.4l-4-3.2.8-.8ZM5.6 18.4l3.2-4 .8.8Z" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

export function TripsLayout() {
  const { pathname } = useLocation()
  const atIndex = /^\/trips\/?$/.test(pathname)
  const creating = /^\/trips\/new\/?$/.test(pathname)

  // The concierge is optional: if its code fails to load, the planner carries on without it.
  const [chatFailed, setChatFailed] = useState(false)

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  useEffect(() => {
    document.documentElement.dataset.tripsScroll = ""
    return () => {
      delete document.documentElement.dataset.tripsScroll
    }
  }, [])

  return (
    <div {...sx("trips", s.root)}>
      <a href="#trips-main" {...sx(s.skip)}>
        Skip to content
      </a>
      <header {...sx(s.header)}>
        <div {...sx(s.headerSide)}>
          {!atIndex && (
            <Link to="/trips" {...sx(a.iconBtn)} aria-label="Back to all trips">
              <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
            </Link>
          )}
          <Link to="/trips" {...sx("group", s.brand)} aria-label="Trips home">
            <CompassMark style={s.brandMark} />
            Trips
          </Link>
        </div>
        <div {...sx(s.headerSide)}>
          {!creating && (
            <Link to="/trips/new" {...sx(a.btn, a.btnGhost, a.btnSm)} aria-label="New trip">
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              <span {...sx(s.newLabel)}>New trip</span>
            </Link>
          )}
          <span {...sx("trip-tap-44")}>
            <ThemeToggle style={s.themeToggle} />
          </span>
          {CLERK_ENABLED && !DEV_BEARER ? <UserButton afterSignOutUrl="/" /> : null}
        </div>
      </header>
      <TripsAuthGate>
        <main id="trips-main" tabIndex={-1} {...sx(s.main)}>
          <Outlet />
        </main>
        {!chatFailed && (
          <OverlayBoundary onError={() => setChatFailed(true)}>
            <Suspense fallback={null}>
              <TripChat />
            </Suspense>
          </OverlayBoundary>
        )}
      </TripsAuthGate>
    </div>
  )
}
