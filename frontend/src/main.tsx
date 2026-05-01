import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRoutes } from './AppRoutes'
import { CLERK_PUBLISHABLE_KEY } from './lib/clerk'
import { createOptionalClerkTree } from './lib/clerkProvider'
import { registerServiceWorker } from './lib/serviceWorker'
import './index.css'

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

registerServiceWorker()

const root = createRoot(document.getElementById('root')!)

void createOptionalClerkTree(<AppRoutes />)
  .then((app) => {
    root.render(<StrictMode>{app}</StrictMode>)
  })
  .catch((error: unknown) => {
    console.error('[auth] Failed to load Clerk. Rendering without auth provider.', error)
    root.render(
      <StrictMode>
        <AppRoutes />
      </StrictMode>,
    )
  })
