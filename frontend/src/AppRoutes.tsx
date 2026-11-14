import { Suspense, type ReactNode } from 'react'
import { lazyRetry } from './lib/lazyRetry'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Landing } from './pages/Landing/Landing'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { routerBasename } from './lib/routerBasename'
import { sx } from './lib/utils'
import { routeFallback } from './styles/chatbot.stylex'

// The chatbot lived at `/` until the lab landing page took the root; it is
// now `/` only, so it loads lazily like every other app.
const App = lazyRetry(() => import('./App'))
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

// Route-aware skeletons so a lazy chunk that's still streaming (or hung on a
// stale SW transition) shows recognizable parchment instead of a blank canvas
// the user reads as "site is down."
function ChatbotFallback() {
  return (
    <div
      {...sx(routeFallback.shell)}
      role="status"
      aria-label="Loading chatbot"
    >
      <span {...sx(routeFallback.label)}>Loading…</span>
    </div>
  )
}

function BreathworkShellFallback() {
  return (
    <div
      {...sx(routeFallback.shell, routeFallback.breathworkShell, 'breathwork')}
      role="status"
      aria-label="Loading BreathFlow"
    >
      <span {...sx(routeFallback.label)}>Loading BreathFlow…</span>
    </div>
  )
}

function TripsShellFallback() {
  return (
    <div
      {...sx(routeFallback.shell, 'trips')}
      role="status"
      aria-label="Loading trip planner"
    >
      <span {...sx(routeFallback.label)}>Loading trips…</span>
    </div>
  )
}

// Wraps the element in <boundary><suspense>{element}</suspense></boundary> so
// that BOTH a chunk-load rejection (handled by the boundary) and a slow chunk
// stream (handled by Suspense's fallback) have a visible, recoverable surface.
// Putting Suspense INSIDE the boundary is load-bearing: if Suspense sits above
// the boundary, a rejected dynamic import bubbles past the boundary to the
// outer Suspense — which has no error story — and the user sees a blank page.
function Guarded({
  app,
  fallback,
  children,
}: {
  app: 'chatbot' | 'breathwork' | 'korea' | 'trips'
  fallback: ReactNode
  children: ReactNode
}) {
  return (
    <RouteErrorBoundary app={app}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}

export function AppRoutes() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <Routes>
        <Route
          path="/"
          element={
            <Guarded app="chatbot" fallback={<ChatbotFallback />}>
              <App />
            </Guarded>
          }
        />
        <Route
          path="/lab"
          element={
            <Guarded app="chatbot" fallback={<ChatbotFallback />}>
              <Landing />
            </Guarded>
          }
        />
        <Route path="/chatbot" element={<Navigate to="/" replace />} />

        <Route
          path="/breathwork"
          element={
            <Guarded app="breathwork" fallback={<BreathworkShellFallback />}>
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
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <KoreaIndexRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/day/:slug"
          element={
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <KoreaDayRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/places"
          element={
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <KoreaPlacesRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/ingest"
          element={
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <KoreaIngestRedirect />
            </Guarded>
          }
        />
        <Route
          path="/korea/*"
          element={
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <KoreaCatchRedirect />
            </Guarded>
          }
        />

        <Route
          path="/trips"
          element={
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <TripsLayout />
            </Guarded>
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
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <AuthPage mode="sign-in" />
            </Guarded>
          }
        />
        <Route
          path="/sign-up"
          element={
            <Guarded app="trips" fallback={<TripsShellFallback />}>
              <AuthPage mode="sign-up" />
            </Guarded>
          }
        />

        <Route
          path="*"
          element={
            <Guarded app="chatbot" fallback={<ChatbotFallback />}>
              <SiteNotFound />
            </Guarded>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
