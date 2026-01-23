import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { BreathworkLayout } from './components/layout/BreathworkLayout'
import { Home } from './pages/Home'
import { Session } from './pages/Session'
import { Progress } from './pages/Progress'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Main chat app */}
        <Route path="/" element={<App />} />

        {/* Breathwork app */}
        <Route path="/breathwork" element={<BreathworkLayout />}>
          <Route index element={<Home />} />
          <Route path="session" element={<Session />} />
          <Route path="progress" element={<Progress />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
