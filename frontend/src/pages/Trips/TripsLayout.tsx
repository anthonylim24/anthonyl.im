import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, Compass, Lock, Menu, Search, X } from "lucide-react"
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react"
import { CLERK_ENABLED } from "@/lib/clerk"
import { ThemeToggle } from "../Korea/ThemeToggle"
import { applyTheme, getInitialTheme } from "../Korea/koreaUtils"
import { CommandSearch, TripsWorkspaceProvider, WorkspacePrompt, WorkspaceSidebar, usePromptRoute, useWorkspace } from "./beautiful"
import { SERIF, accentIconClass, focusRingClass, iconBtnClass, primaryBtnClass } from "./ui"

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
        <div className="flex min-h-[70dvh] items-center justify-center px-5 py-16">
          <div className="w-full max-w-md text-center">
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200/80 bg-[var(--trips-surface)] shadow-sm dark:border-stone-800 ${accentIconClass}`}
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

function TripsShell() {
  const location = useLocation()
  const { openSearch, sidebarOpen, setSidebarOpen } = useWorkspace()
  const atIndex = location.pathname === "/trips" || location.pathname === "/trips/"
  const promptPad = usePromptRoute()
  const chatPad = /\/trips\/(?!new(?:\/|$))[^/]+(?:\/day\/[^/]+)?\/?$/.test(location.pathname)
  const [desktopNav, setDesktopNav] = useState(true)

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname, setSidebarOpen])

  return (
    <div className="flex min-h-dvh">
      <aside
        className={`hidden shrink-0 border-r border-stone-200/70 bg-[color-mix(in_srgb,var(--trips-canvas)_94%,transparent)] lg:flex dark:border-stone-800/70 ${
          desktopNav ? "w-64" : "w-0 overflow-hidden border-0"
        }`}
      >
        {desktopNav ? <WorkspaceSidebar /> : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href="#trips-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-[color:var(--trips-accent)] focus:px-4 focus:text-sm focus:font-medium focus:text-white dark:focus:text-stone-950"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-stone-200/60 bg-[color-mix(in_srgb,var(--trips-canvas)_88%,transparent)] backdrop-blur-md dark:border-stone-800/60">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 pt-[env(safe-area-inset-top,0px)]">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className={`${iconBtnClass} lg:hidden`}
                aria-label="Open workspace menu"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                className={`${iconBtnClass} hidden lg:inline-flex`}
                aria-label={desktopNav ? "Hide workspace sidebar" : "Show workspace sidebar"}
                aria-pressed={desktopNav}
                onClick={() => setDesktopNav((v) => !v)}
              >
                <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
              {!atIndex && (
                <Link to="/trips" className={iconBtnClass} aria-label="Back to all trips">
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </Link>
              )}
              <Link
                to="/trips"
                className={`-mx-2 inline-flex min-h-11 items-center rounded-lg px-2 font-display text-[1.35rem] leading-none tracking-tight text-stone-900 transition hover:text-[color:var(--trips-accent)] dark:text-stone-100 ${focusRingClass}`}
                style={SERIF}
              >
                Trips
              </Link>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button type="button" onClick={openSearch} className={iconBtnClass} aria-label="Search trips">
                <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
              <span className="trip-tap-44 inline-flex">
                <ThemeToggle />
              </span>
              {CLERK_ENABLED && !DEV_BEARER ? <UserButton afterSignOutUrl="/" /> : null}
            </div>
          </div>
        </header>
        <main id="trips-main" className={promptPad || chatPad ? "px-0 pb-40" : "px-0 pb-10 sm:pb-14"}>
          <Outlet />
        </main>
        <WorkspacePrompt />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-stone-950/40"
            aria-label="Close workspace menu"
            onClick={() => setSidebarOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Trip workspace"
            className="absolute inset-y-0 left-0 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto bg-[var(--trips-canvas)] p-4 shadow-2xl"
          >
            <div className="mb-3 flex justify-end">
              <button type="button" className={iconBtnClass} aria-label="Close workspace menu" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <WorkspaceSidebar mobile onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <CommandSearch />
      <Suspense fallback={null}>
        <TripChat />
      </Suspense>
    </div>
  )
}

export function TripsLayout() {
  return (
    <TripsWorkspaceProvider>
      <div className="trips min-h-dvh text-stone-900 dark:text-stone-100">
        <TripsAuthGate>
          <TripsShell />
        </TripsAuthGate>
      </div>
    </TripsWorkspaceProvider>
  )
}
