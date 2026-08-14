import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { routerBasename } from './lib/routerBasename'

// Lazy load the BreathFlow shell and pages for better initial bundle size.
const BreathworkLayout = lazy(() =>
  import('./breathflow/pages/BreathflowLayout').then((module) => ({
    default: module.BreathflowLayout,
  })),
)
const Home = lazy(() =>
  import('./breathflow/pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const Session = lazy(() =>
  import('./breathflow/pages/SessionPage').then((module) => ({ default: module.SessionPage })),
)
const Progress = lazy(() =>
  import('./breathflow/pages/ProgressPage').then((module) => ({ default: module.ProgressPage })),
)
const Settings = lazy(() =>
  import('./breathflow/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const BreathworkNotFound = lazy(() =>
  import('./breathflow/pages/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  })),
)
const KoreaLayout = lazy(() =>
  import('./pages/Korea/KoreaLayout').then((module) => ({ default: module.KoreaLayout })),
)
const KoreaIndex = lazy(() =>
  import('./pages/Korea/KoreaIndex').then((module) => ({ default: module.KoreaIndex })),
)
const KoreaDay = lazy(() =>
  import('./pages/Korea/KoreaDay').then((module) => ({ default: module.KoreaDay })),
)
const Ingest = lazy(() =>
  import('./pages/Korea/Ingest').then((module) => ({ default: module.Ingest })),
)
const Places = lazy(() =>
  import('./pages/Korea/Places').then((module) => ({ default: module.Places })),
)
const TripsLayout = lazy(() =>
  import('./pages/Trips/TripsLayout').then((module) => ({ default: module.TripsLayout })),
)
const TripsIndex = lazy(() =>
  import('./pages/Trips/TripsIndex').then((module) => ({ default: module.TripsIndex })),
)
const TripCreate = lazy(() =>
  import('./pages/Trips/TripCreate').then((module) => ({ default: module.TripCreate })),
)
const TripDetail = lazy(() =>
  import('./pages/Trips/TripDetail').then((module) => ({ default: module.TripDetail })),
)
const TripOverview = lazy(() =>
  import('./pages/Trips/TripOverview').then((module) => ({ default: module.TripOverview })),
)
const TripDayPage = lazy(() =>
  import('./pages/Trips/TripDayPage').then((module) => ({ default: module.TripDayPage })),
)

// Route-aware skeletons so a lazy chunk that's still streaming (or hung on a
// stale SW transition) shows recognizable parchment instead of a blank canvas
// the user reads as "site is down."
function ChatbotFallback() {
  return (
    <div
      className="chat chat-light flex min-h-dvh items-center justify-center bg-[var(--ch-canvas)] text-[color:var(--ch-ink-muted)]"
      role="status"
      aria-label="Loading the assistant"
    >
      <span className="text-sm">Loading…</span>
    </div>
  )
}

function BreathworkShellFallback() {
  return (
    <div
      className="breathwork flex min-h-dvh items-center justify-center bg-bw-canvas text-stone-500 dark:text-stone-400"
      role="status"
      aria-label="Loading BreathFlow"
    >
      <span className="text-sm">Loading BreathFlow…</span>
    </div>
  )
}

function TripsShellFallback() {
  return (
    <div
      className="trips flex min-h-dvh items-center justify-center bg-[var(--tr-canvas)] text-[color:var(--tr-ink-muted)]"
      role="status"
      aria-label="Loading trip planner"
    >
      <span className="text-sm">Loading trips…</span>
    </div>
  )
}

function KoreaShellFallback() {
  return (
    <div
      className="korea flex min-h-dvh items-center justify-center bg-stone-50 text-stone-500 dark:bg-stone-950 dark:text-stone-400"
      role="status"
      aria-label="Loading Korea itinerary"
    >
      <span className="text-sm">Loading the dossier…</span>
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
          path="/chatbot"
          element={
            <Guarded app="chatbot" fallback={<ChatbotFallback />}>
              <App />
            </Guarded>
          }
        />

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
            <Guarded app="korea" fallback={<KoreaShellFallback />}>
              <KoreaLayout />
            </Guarded>
          }
        >
          <Route index element={<KoreaIndex />} />
          <Route path="day/:slug" element={<KoreaDay />} />
          <Route path="ingest" element={<Ingest />} />
          <Route path="places" element={<Places />} />
        </Route>

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
          <Route path=":tripId" element={<TripOverview />} />
          <Route path=":tripId/edit" element={<TripDetail />} />
          <Route path=":tripId/day/:dayId" element={<TripDayPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
