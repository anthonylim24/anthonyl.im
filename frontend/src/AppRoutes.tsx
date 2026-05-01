import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { BreathworkLayout } from './components/layout/BreathworkLayout'
import {
  loadBreathworkNotFoundPage,
  loadHomePage,
  loadProgressPage,
  loadSessionPage,
  loadSettingsPage,
} from './lib/breathworkRoutePreload'

// Lazy load breathwork pages for better initial bundle size.
const Home = lazy(() => loadHomePage().then((module) => ({ default: module.Home })))
const Session = lazy(() => loadSessionPage().then((module) => ({ default: module.Session })))
const Progress = lazy(() => loadProgressPage().then((module) => ({ default: module.Progress })))
const Settings = lazy(() => loadSettingsPage().then((module) => ({ default: module.Settings })))
const BreathworkNotFound = lazy(() => loadBreathworkNotFoundPage().then((module) => ({ default: module.BreathworkNotFound })))

export function AppRoutes() {
  return (
    <BrowserRouter>
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
      </Routes>
    </BrowserRouter>
  )
}
