import { StrictMode, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { BreathworkLayout } from './components/layout/BreathworkLayout'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (import.meta.env.DEV || !CLERK_PUBLISHABLE_KEY) {
  console.debug(
    '[auth]',
    CLERK_PUBLISHABLE_KEY
      ? `Clerk enabled (key: ${CLERK_PUBLISHABLE_KEY.slice(0, 12)}…)`
      : 'Clerk disabled — VITE_CLERK_PUBLISHABLE_KEY is not set. Ensure it is present in the .env at build time.'
  )
}

// Lazy load breathwork pages for better initial bundle size
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Session = lazy(() => import('./pages/Session').then(m => ({ default: m.Session })))
const Progress = lazy(() => import('./pages/Progress').then(m => ({ default: m.Progress })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      {/* Main chat app */}
      <Route path="/" element={<App />} />
      <Route path="/chatbot" element={<App />} />

      {/* Breathwork app - routes lazy loaded (Suspense in AnimatedOutlet) */}
      <Route path="/breathwork" element={<BreathworkLayout />}>
        <Route index element={<Home />} />
        <Route path="session" element={<Session />} />
        <Route path="progress" element={<Progress />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  </BrowserRouter>
)

// Easter egg for curious developers
if (import.meta.env.PROD) {
  console.log(
    '%c🌬 BreathFlow',
    'font-size:20px;font-weight:bold;color:#818CF8;',
  )
  console.log(
    '%cBuilt with care by Anthony Lim.\nCurious how it works? → github.com/anthonylim24',
    'font-size:12px;color:#6b7280;',
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {CLERK_PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/breathwork">
        <AppRoutes />
      </ClerkProvider>
    ) : (
      <AppRoutes />
    )}
  </StrictMode>,
)
