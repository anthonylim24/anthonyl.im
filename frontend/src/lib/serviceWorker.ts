// Service worker registration + auto-update flow.
//
// We register `/sw.js` in production, then:
//   1. Watch for a NEW service worker that is `waiting` (already downloaded,
//      not yet activated because the old SW is still controlling clients).
//   2. Send it a `SKIP_WAITING` message so it takes over immediately.
//   3. Listen for `controllerchange` — fired when the new SW becomes the
//      active controller. Force a one-shot reload so the page is served by
//      the new SW + new asset bundle hashes.
//   4. Poll `registration.update()` every five minutes so a long-running tab
//      eventually picks up new deploys without a manual reload.
//
// Without this flow, deploying a new SW + new JS bundles leaves users on the
// old bundles indefinitely (a classic PWA staleness trap).

const SERVICE_WORKER_PATH = "/sw.js"
const UPDATE_INTERVAL_MS = 5 * 60 * 1000

interface ServiceWorkerEnv {
  PROD?: boolean
}

interface ServiceWorkerNavigator {
  serviceWorker?: ServiceWorkerContainer
}

interface ServiceWorkerWindow {
  addEventListener: Window["addEventListener"]
  location?: { reload: () => void }
}

export function registerServiceWorker(
  env: ServiceWorkerEnv = import.meta.env,
  navigatorRef: ServiceWorkerNavigator = navigator as unknown as ServiceWorkerNavigator,
  windowRef: ServiceWorkerWindow = window,
): boolean {
  if (!env.PROD || !navigatorRef.serviceWorker) return false
  const swContainer = navigatorRef.serviceWorker
  if (!swContainer) return false

  // Reload on controller change. We guard against an infinite loop when the
  // page is first loaded under a SW (initial controller change is expected
  // when the page goes from "no SW" → "new SW").
  let reloaded = false
  swContainer.addEventListener("controllerchange", () => {
    if (reloaded) return
    reloaded = true
    try {
      windowRef.location?.reload()
    } catch {
      /* no-op in test envs */
    }
  })

  windowRef.addEventListener(
    "load",
    () => {
      swContainer
        .register(SERVICE_WORKER_PATH)
        .then((registration) => {
          // If there's already a waiting worker at register time, activate it.
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" })
          }
          // When an update is found, watch the installing worker for its
          // state transitions. Once it's "installed" and there's an existing
          // controller (the old SW), tell it to skip waiting.
          registration.addEventListener("updatefound", () => {
            const next = registration.installing
            if (!next) return
            next.addEventListener("statechange", () => {
              if (next.state === "installed" && swContainer.controller) {
                next.postMessage({ type: "SKIP_WAITING" })
              }
            })
          })
          // Periodic update check so long-lived tabs eventually update.
          setInterval(() => {
            registration.update().catch(() => {
              /* offline / network errors are fine */
            })
          }, UPDATE_INTERVAL_MS)
        })
        .catch(() => {
          // Offline support is additive; registration failure should not block the app.
        })
    },
    { once: true },
  )

  return true
}
