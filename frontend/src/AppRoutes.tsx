import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import {
  loadBreathworkNotFoundPage,
  loadHomePage,
  loadProgressPage,
  loadSessionPage,
  loadSettingsPage,
} from './lib/breathworkRoutePreload'

// Lazy load the BreathFlow shell and pages for better initial bundle size.
const BreathworkLayout = lazy(() =>
  import('./components/layout/BreathworkLayout').then((module) => ({
    default: module.BreathworkLayout,
  })),
)
const Home = lazy(() => loadHomePage().then((module) => ({ default: module.Home })))
const Session = lazy(() => loadSessionPage().then((module) => ({ default: module.Session })))
const Progress = lazy(() => loadProgressPage().then((module) => ({ default: module.Progress })))
const Settings = lazy(() => loadSettingsPage().then((module) => ({ default: module.Settings })))
const BreathworkNotFound = lazy(() =>
  loadBreathworkNotFoundPage().then((module) => ({
    default: module.BreathworkNotFound,
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

// Route-aware skeletons so a lazy chunk that's still streaming (or hung on a
// stale SW transition) shows recognizable parchment instead of a blank canvas
// the user reads as "site is down."
function ChatbotFallback() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-500 dark:bg-stone-950 dark:text-stone-400"
      role="status"
      aria-label="Loading chatbot"
    >
      <span className="text-sm">Loading…</span>
    </div>
  )
}

function BreathworkShellFallback() {
  return (
    <div
      className="breathwork flex min-h-screen items-center justify-center bg-bw-canvas text-stone-500 dark:text-stone-400"
      role="status"
      aria-label="Loading BreathFlow"
    >
      <span className="text-sm">Loading BreathFlow…</span>
    </div>
  )
}

function KoreaShellFallback() {
  return (
    <div
      className="korea flex min-h-screen items-center justify-center bg-stone-50 text-stone-500 dark:bg-stone-950 dark:text-stone-400"
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
  app: 'chatbot' | 'breathwork' | 'korea'
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
    <BrowserRouter>
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
      </Routes>
    </BrowserRouter>
  )
}
