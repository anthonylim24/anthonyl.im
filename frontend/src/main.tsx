import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { BreathworkLayout } from './components/layout/BreathworkLayout'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Lazy load breathwork pages for better initial bundle size
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Session = lazy(() => import('./pages/Session').then(m => ({ default: m.Session })))
const Progress = lazy(() => import('./pages/Progress').then(m => ({ default: m.Progress })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))

// Loading fallback for route transitions
const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
)

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      {/* Main chat app */}
      <Route path="/" element={<App />} />
      <Route path="/chatbot" element={<App />} />

      {/* Breathwork app - routes lazy loaded */}
      <Route path="/breathwork" element={<BreathworkLayout />}>
        <Route index element={<Suspense fallback={<RouteLoader />}><Home /></Suspense>} />
        <Route path="session" element={<Suspense fallback={<RouteLoader />}><Session /></Suspense>} />
        <Route path="progress" element={<Suspense fallback={<RouteLoader />}><Progress /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<RouteLoader />}><Settings /></Suspense>} />
      </Route>
    </Routes>
  </BrowserRouter>
)

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
