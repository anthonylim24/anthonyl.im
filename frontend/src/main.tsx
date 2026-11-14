import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRoutes } from './AppRoutes'
import { createOptionalClerkTree } from './lib/clerkProvider'
import { registerServiceWorker } from './lib/serviceWorker'
import { installErrorReporting, reportClientEvent } from './lib/telemetry'
import './index.css'

registerServiceWorker()
if (import.meta.env.PROD) installErrorReporting()

const root = createRoot(document.getElementById('root')!)

void createOptionalClerkTree(<AppRoutes />)
  .then((app) => {
    root.render(<StrictMode>{app}</StrictMode>)
  })
  .catch((error: unknown) => {
    console.error('[auth] Failed to load Clerk. Rendering without auth provider.', error)
    reportClientEvent('auth_provider_failed', error instanceof Error ? error.message : String(error))
    root.render(
      <StrictMode>
        <AppRoutes />
      </StrictMode>,
    )
  })
