import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRoutes } from './AppRoutes'
import { DevStyleXInject } from './components/DevStyleXInject'
import { createOptionalClerkTree } from './lib/clerkProvider'
import { registerServiceWorker } from './lib/serviceWorker'
import './index.css'

if (import.meta.env.DEV) {
  void import('virtual:stylex:runtime')
}

registerServiceWorker()

const root = createRoot(document.getElementById('root')!)

void createOptionalClerkTree(<AppRoutes />)
  .then((app) => {
    root.render(
      <StrictMode>
        <DevStyleXInject />
        {app}
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    console.error('[auth] Failed to load Clerk. Rendering without auth provider.', error)
    root.render(
      <StrictMode>
        <DevStyleXInject />
        <AppRoutes />
      </StrictMode>,
    )
  })
