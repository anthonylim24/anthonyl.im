import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { lazyRetry } from './lib/lazyRetry'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { routerBasename } from './lib/routerBasename'
import { notifyRouteChange } from './lib/serviceWorker'
import { BootHold, BootReady } from './lib/bootScreen'
import { tripsPageAt } from './pages/Trips/routePages'

// Every route is lazy: the entry holds only the router, the boundaries and
// the boot screen's holds, so no app's code or vendor groups load with another app.
// `scripts/check-entry-preloads.mjs` fails the build if that slips.
const App = lazyRetry(() => import('./App'))
const Landing = lazyRetry(() =>
  import('./pages/Landing/Landing').then((module) => ({ default: module.Landing })),
)
const AuthPage = lazyRetry(() =>
  import('./pages/Auth/AuthPage').then((module) => ({ default: module.AuthPage })),
)
// Lazy load the BreathFlow shell and pages for better initial bundle size.
const BreathworkLayout = lazyRetry(() =>
  import('./breathflow/pages/BreathflowLayout').then((module) => ({
    default: module.BreathflowLayout,
  })),
)
const Home = lazyRetry(() =>
  import('./breathflow/pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const Session = lazyRetry(() =>
  import('./breathflow/pages/SessionPage').then((module) => ({ default: module.SessionPage })),
)
const Progress = lazyRetry(() =>
  import('./breathflow/pages/ProgressPage').then((module) => ({ default: module.ProgressPage })),
)
const Settings = lazyRetry(() =>
  import('./breathflow/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const BreathworkNotFound = lazyRetry(() =>
  import('./breathflow/pages/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  })),
)
const KoreaIndexRedirect = lazyRetry(() =>
  import('./pages/Trips/KoreaRedirects').then((module) => ({ default: module.KoreaIndexRedirect })),
)
const KoreaDayRedirect = lazyRetry(() =>
  import('./pages/Trips/KoreaRedirects').then((module) => ({ default: module.KoreaDayRedirect })),
)
const KoreaPlacesRedirect = lazyRetry(() =>
  import('./pages/Trips/KoreaRedirects').then((module) => ({ default: module.KoreaPlacesRedirect })),
)
const KoreaIngestRedirect = lazyRetry(() =>
  import('./pages/Trips/KoreaRedirects').then((module) => ({ default: module.KoreaIngestRedirect })),
)
const KoreaCatchRedirect = lazyRetry(() =>
  import('./pages/Trips/KoreaRedirects').then((module) => ({ default: module.KoreaCatchRedirect })),
)
const TripEditRedirect = lazyRetry(() =>
  import('./pages/Trips/KoreaRedirects').then((module) => ({ default: module.TripEditRedirect })),
)
const TripsLayout = lazyRetry(() =>
  import('./pages/Trips/TripsLayout').then((module) => ({ default: module.TripsLayout })),
)
const TripsIndex = lazyRetry(() =>
  import('./pages/Trips/TripsIndex').then((module) => ({ default: module.TripsIndex })),
)
const TripCreate = lazyRetry(() =>
  import('./pages/Trips/TripCreate').then((module) => ({ default: module.TripCreate })),
)
const TripWorkspace = lazyRetry(() =>
  import('./pages/Trips/TripWorkspace').then((module) => ({ default: module.TripWorkspace })),
)
const TripJoin = lazyRetry(() =>
  import('./pages/Trips/TripJoin').then((module) => ({ default: module.TripJoin })),
)
const SiteNotFound = lazyRetry(() =>
  import('./pages/SiteNotFound').then((module) => ({ default: module.SiteNotFound })),
)
const TripsNotFound = lazyRetry(() =>
  import('./pages/Trips/TripsNotFound').then((module) => ({ default: module.TripsNotFound })),
)

// Wraps the element in <boundary><suspense>{element}</suspense></boundary> so
// that BOTH a chunk-load rejection (handled by the boundary) and a slow chunk
// stream (handled by Suspense's fallback) have a visible, recoverable surface.
// Putting Suspense INSIDE the boundary is load-bearing: if Suspense sits above
// the boundary, a rejected dynamic import bubbles past the boundary to the
// outer Suspense — which has no error story — and the user sees a blank page.
export function Guarded({
  app,
  fallback,
  children,
}: {
  app: 'chatbot' | 'breathwork' | 'korea' | 'trips'
  fallback: ReactNode
  children: ReactNode
}) {
  // Every route renders its boundary at the same place in the tree, so React
  // would keep one boundary (and its caught error) across navigations.
  // `resetKey` clears the error when the location changes: Back from a crashed
  // route shows the route you went back to.
  const { key } = useLocation()
  return (
    <RouteErrorBoundary app={app} resetKey={key}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}

const tripsPages = { index: TripsIndex, create: TripCreate, join: TripJoin, trip: TripWorkspace } as const

// TripsLayout renders its page only once the sign-in gate (Clerk, then
// `claimDevice`) has answered. The page's chunk downloads meanwhile, next to
// the layout's, instead of after it. Who sees what is still the gate's call.
function TripsPagePreload() {
  const page = tripsPageAt(useLocation().pathname)
  useEffect(() => {
    if (page) tripsPages[page].preload()
  }, [page])
  return null
}

// A route change is a page change already, so a waiting app update reloads
// into the new route then (lib/serviceWorker.ts) instead of interrupting one.
function RouteChangeSignal() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (pathname === previous.current) return
    previous.current = pathname
    notifyRouteChange()
  }, [pathname])
  return null
}

export function AppRoutes() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <BootReady />
      <RouteChangeSignal />
      <Routes>
        <Route
          path="/"
          element={
            <Guarded app="chatbot" fallback={<BootHold world="lim" step="code" />}>
              <App />
            </Guarded>
          }
        />
        <Route
          path="/lab"
          element={
            <Guarded app="chatbot" fallback={<BootHold world="lab" step="code" />}>
              <Landing />
            </Guarded>
          }
        />
        <Route path="/chatbot" element={<Navigate to="/" replace />} />

        <Route
          path="/breathwork"
          element={
            <Guarded app="breathwork" fallback={<BootHold world="breathwork" step="code" />}>
              <BreathworkLayout />
            </Guarded>
          }
        >
          <Route index element={<Home />} />
          <Route path="session" element={<Session />} />
          <Route path="progress" element={<Progress />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<BreathworkNotFound />} />
        </Route>

        <Route
          path="/korea"
          element={
            <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
              <KoreaIndexRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/day/:slug"
          element={
            <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
              <KoreaDayRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/places"
          element={
            <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
              <KoreaPlacesRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/ingest"
          element={
            <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
              <KoreaIngestRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/*"
          element={
            <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
              <KoreaCatchRedirect />
            </Guarded>
          }
        />

        <Route
          path="/trips"
          element={
            <>
              <TripsPagePreload />
              <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
                <TripsLayout />
              </Guarded>
            </>
          }
        >
          <Route index element={<TripsIndex />} />
          <Route path="new" element={<TripCreate />} />
          <Route path="join/:token" element={<TripJoin />} />
          <Route path=":tripId" element={<TripWorkspace />} />
          <Route path=":tripId/day/:dayId" element={<TripWorkspace />} />
          <Route path=":tripId/edit" element={<TripEditRedirect />} />
          <Route path=":tripId/places" element={<TripEditRedirect />} />
          <Route path="*" element={<TripsNotFound />} />
        </Route>

        <Route
          path="/sign-in"
          element={
            <Guarded app="trips" fallback={<BootHold world="auth" step="code" />}>
              <AuthPage mode="sign-in" />
            </Guarded>
          }
        />
        <Route
          path="/sign-up"
          element={
            <Guarded app="trips" fallback={<BootHold world="auth" step="code" />}>
              <AuthPage mode="sign-up" />
            </Guarded>
          }
        />

        <Route
          path="*"
          element={
            <Guarded app="chatbot" fallback={<BootHold world="lim" step="code" />}>
              <SiteNotFound />
            </Guarded>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
