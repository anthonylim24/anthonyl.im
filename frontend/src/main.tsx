import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRoutes } from './AppRoutes'
import { loadInflectTracking } from './lib/analytics'
import { createOptionalClerkTree } from './lib/clerkProvider'
import { isChunkLoadError, reloadForNewBuild } from './lib/lazyRetry'
import { registerServiceWorker } from './lib/serviceWorker'
import { installErrorReporting, reportClientEvent, sendUnsentEvents } from './lib/telemetry'
import './index.css'

registerServiceWorker()
if (import.meta.env.PROD) {
  installErrorReporting()
  // Third-party analytics waits for the page; it never delays first paint.
  // So do reports an earlier, blocked load could not send.
  window.addEventListener(
    'load',
    () => {
      sendUnsentEvents()
      loadInflectTracking()
    },
    { once: true },
  )
}

const root = createRoot(document.getElementById('root')!)

void createOptionalClerkTree(<AppRoutes />)
  .then((app) => {
    root.render(<StrictMode>{app}</StrictMode>)
  })
  .catch((error: unknown) => {
    console.error('[auth] Failed to load Clerk. Rendering without auth provider.', error)
    reportClientEvent('auth_provider_failed', error instanceof Error ? error.message : String(error))
    // The auth chunk did not arrive (a stalled download, an old build): a
    // fresh load usually gets it, and signed-in pages cannot work without it.
    if (isChunkLoadError(error) && reloadForNewBuild()) return
    root.render(
      <StrictMode>
        <AppRoutes />
      </StrictMode>,
    )
  })
