import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
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

const BreathworkShellFallback = () => (
  <div
    className="breathwork min-h-screen bg-bw-canvas"
    role="status"
    aria-label="Loading BreathFlow"
  />
)

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<BreathworkShellFallback />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/chatbot" element={<App />} />

          <Route path="/breathwork" element={<BreathworkLayout />}>
            <Route index element={<Home />} />
            <Route path="session" element={<Session />} />
            <Route path="progress" element={<Progress />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<BreathworkNotFound />} />
          </Route>

          <Route path="/korea" element={<KoreaLayout />}>
            <Route index element={<KoreaIndex />} />
            <Route path="day/:slug" element={<KoreaDay />} />
            <Route path="ingest" element={<Ingest />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
