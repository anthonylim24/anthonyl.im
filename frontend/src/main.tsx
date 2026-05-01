import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { AppRoutes } from './AppRoutes'
import './index.css'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (import.meta.env.DEV || !CLERK_PUBLISHABLE_KEY) {
  console.debug(
    '[auth]',
    CLERK_PUBLISHABLE_KEY
      ? `Clerk enabled (key: ${CLERK_PUBLISHABLE_KEY.slice(0, 12)}…)`
      : 'Clerk disabled — VITE_CLERK_PUBLISHABLE_KEY is not set. Ensure it is present in the .env at build time.'
  )
}

// Easter egg for curious developers
if (import.meta.env.PROD) {
  console.log(
    '%c🌬 BreathFlow',
    'font-size:20px;font-weight:bold;color:#1a1a1a;',
  )
  console.log(
    '%cBuilt with care by Anthony Lim.\nCurious how it works? → github.com/anthonylim24',
    'font-size:12px;color:#888;',
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
