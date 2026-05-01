import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { BreathworkLayout } from './components/layout/BreathworkLayout'

// Lazy load breathwork pages for better initial bundle size.
const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })))
const Session = lazy(() => import('./pages/Session').then((module) => ({ default: module.Session })))
const Progress = lazy(() => import('./pages/Progress').then((module) => ({ default: module.Progress })))
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })))
const BreathworkNotFound = lazy(() =>
  import('./pages/BreathworkNotFound').then((module) => ({ default: module.BreathworkNotFound }))
)

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
