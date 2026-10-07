import { sx } from '@/lib/utils'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeft, Lock, Plus, Send } from 'lucide-react'
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from '@clerk/clerk-react'
import { CLERK_ENABLED } from '@/lib/clerk'
import { ThemeToggle } from '../Korea/ThemeToggle'
import { applyTheme, getInitialTheme } from '../Korea/koreaUtils'
import { CompactChromeProvider, useCompactChrome } from './useCompactChrome'
import { styles } from './trips.stylex'
import {
  chromeHeaderClass,
  focusRingClass,
  iconBtnClass,
  mutedInkClass,
  primaryBtnClass,
  typePageTitleClass,
  wrapAnywhereClass,
} from './ui'

const TripChat = lazy(() => import('./TripChat').then((m) => ({ default: m.TripChat })))

const DEV_BEARER: string | null =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEV_BEARER) || null

function TripsAuthGate({ children }: { children: ReactNode }) {
  if (DEV_BEARER) return <>{children}</>
  if (!CLERK_ENABLED) return <>{children}</>
  return <ClerkTripsGate>{children}</ClerkTripsGate>
}

function ClerkTripsGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()
  if (!isLoaded) {
    return (
      <div {...sx(styles.authLoading)} role="status" aria-label="Checking sign-in">
        <span {...sx(styles.authSignInCopy)}>Loading…</span>
      </div>
    )
  }
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div {...sx(styles.authSignInShell)}>
          <div {...sx(styles.authSignInInner)}>
            <h1 {...sx(typePageTitleClass)}>Sign in to Trips</h1>
            <p {...sx(styles.authSignInCopy, mutedInkClass)}>
              Days, reservations, and Map Mode stay private.
            </p>
            <SignInButton mode="modal">
              <button type="button" {...sx(styles.authSignInBtn, primaryBtnClass)}>
                <Lock {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
                Sign in to continue
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </>
  )
}

function isTripChatPad(pathname: string): boolean {
  const segs = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (segs[0] !== 'trips' || !segs[1] || segs[1] === 'new') return false
  if (segs.length === 2) return true
  return segs.length === 4 && segs[2] === 'day'
}

function tripCrumbFromPath(pathname: string): string | null {
  const segs = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (segs[0] !== 'trips' || !segs[1] || segs[1] === 'new') return null
  return decodeURIComponent(segs[1])
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}

export function TripsLayout() {
  const location = useLocation()
  const atIndex = location.pathname === '/trips' || location.pathname === '/trips/'
  const chatPad = isTripChatPad(location.pathname)
  const crumb = tripCrumbFromPath(location.pathname)

  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  useEffect(() => {
    document.documentElement.dataset.tripsScroll = ''
    return () => {
      delete document.documentElement.dataset.tripsScroll
    }
  }, [])

  return (
    <CompactChromeProvider>
      <TripsShell atIndex={atIndex} chatPad={chatPad} crumb={crumb} />
    </CompactChromeProvider>
  )
}

function TripsShell({
  atIndex,
  chatPad,
  crumb,
}: {
  atIndex: boolean
  chatPad: boolean
  crumb: string | null
}) {
  const compact = useCompactChrome()

  return (
    <div
      {...sx('trips', styles.tripsRoot)}
      data-chrome-compact={compact ? 'true' : undefined}
    >
      <TripsAuthGate>
        <a href="#trips-main" {...sx(styles.skipLink)}>
          Skip to content
        </a>
        <header {...sx(chromeHeaderClass)}>
          <div {...sx(styles.chromeInner)}>
            <nav aria-label="Breadcrumb" {...sx(styles.breadcrumbNav)}>
              {!atIndex && (
                <Link
                  to="/trips"
                  {...sx(iconBtnClass, styles.backLinkMobile)}
                  aria-label="Back to all trips"
                >
                  <ArrowLeft {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
                </Link>
              )}
              <ol {...sx(styles.breadcrumbList)}>
                <li {...sx(styles.shrink0)}>
                  <Link to="/trips" {...sx('chrome-wordmark', styles.chromeWordmark, focusRingClass)}>
                    <Send {...sx('chrome-plane', styles.chromePlane)} strokeWidth={2.25} aria-hidden />
                    Trips
                  </Link>
                </li>
                {crumb ? (
                  <li aria-current="page" {...sx(styles.breadcrumbCrumb)}>
                    <span aria-hidden {...sx(styles.breadcrumbSep)}>
                      /
                    </span>
                    <span {...sx(styles.breadcrumbTitle, wrapAnywhereClass)}>{crumb}</span>
                  </li>
                ) : null}
              </ol>
              <Link
                to="/trips/new"
                tabIndex={compact ? -1 : undefined}
                aria-hidden={compact || undefined}
                {...sx('chrome-new-trip', styles.chromeNewTrip, mutedInkClass, focusRingClass)}
              >
                <Plus {...sx(styles.iconXs)} strokeWidth={1.5} aria-hidden />
                New trip
              </Link>
            </nav>
            <div {...sx(styles.chromeActions)}>
              <span {...sx('trip-tap-44', styles.themeToggleWrap)}>
                <ThemeToggle style={styles.themeToggle} />
              </span>
              {CLERK_ENABLED && !DEV_BEARER ? <UserButton afterSignOutUrl="/" /> : null}
            </div>
          </div>
        </header>
        <main
          id="trips-main"
          tabIndex={-1}
          {...sx(chatPad ? styles.mainChatPad : styles.mainDefault)}
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
