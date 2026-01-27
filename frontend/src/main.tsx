import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { BreathworkLayout } from './components/layout/BreathworkLayout'

// Lazy load breathwork pages for better initial bundle size
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Session = lazy(() => import('./pages/Session').then(m => ({ default: m.Session })))
const Progress = lazy(() => import('./pages/Progress').then(m => ({ default: m.Progress })))

// Loading fallback for route transitions
const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Main chat app */}
        <Route path="/" element={<App />} />

        {/* Breathwork app - routes lazy loaded */}
        <Route path="/breathwork" element={<BreathworkLayout />}>
          <Route index element={<Suspense fallback={<RouteLoader />}><Home /></Suspense>} />
          <Route path="session" element={<Suspense fallback={<RouteLoader />}><Session /></Suspense>} />
          <Route path="progress" element={<Suspense fallback={<RouteLoader />}><Progress /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
