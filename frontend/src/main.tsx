import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRoutes } from './AppRoutes'
import { createOptionalClerkTree } from './lib/clerkProvider'
import { registerServiceWorker } from './lib/serviceWorker'
import './index.css'

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
