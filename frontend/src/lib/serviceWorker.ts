// Service worker registration + auto-update flow.
//
// Toggled by VITE_ENABLE_SERVICE_WORKER (default: off). When the flag is off
// we additionally unregister any existing SW and delete its caches so a
// previously-installed worker cannot keep serving stale bundles. This is the
// escape hatch for the classic PWA staleness trap: deploying a fix and
// finding users still pinned to old asset hashes.
//
// When the flag is on we:
//   1. Register `/sw.js`.
//   2. Watch for a NEW service worker that is `waiting` (already downloaded,
//      not yet activated because the old SW is still controlling clients).
//   3. Send it a `SKIP_WAITING` message so it takes over immediately.
//   4. Listen for `controllerchange` — fired when the new SW becomes the
//      active controller. Force a one-shot reload so the page is served by
//      the new SW + new asset bundle hashes.
//   5. Poll `registration.update()` every five minutes so a long-running tab
//      eventually picks up new deploys without a manual reload.

const SERVICE_WORKER_PATH = "/sw.js"
const UPDATE_INTERVAL_MS = 5 * 60 * 1000

interface ServiceWorkerEnv {
  PROD?: boolean
  VITE_ENABLE_SERVICE_WORKER?: string | boolean
}

interface ServiceWorkerNavigator {
  serviceWorker?: ServiceWorkerContainer
}

interface ServiceWorkerWindow {
  addEventListener: Window["addEventListener"]
  location?: { reload: () => void }
}

interface CacheGlobal {
  caches?: CacheStorage
}

function isEnabled(env: ServiceWorkerEnv): boolean {
  const raw = env.VITE_ENABLE_SERVICE_WORKER
  if (raw === true) return true
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase()
    return v === "true" || v === "1" || v === "yes" || v === "on"
  }
  return false
}

// Wipe SW + cache state. Safe to call when nothing is registered. Returns
// once both unregistration and cache deletion settle so callers can chain a
// reload if needed.
export async function unregisterServiceWorker(
  navigatorRef: ServiceWorkerNavigator = navigator as unknown as ServiceWorkerNavigator,
  cacheRef: CacheGlobal = globalThis as unknown as CacheGlobal,
): Promise<void> {
  const swContainer = navigatorRef.serviceWorker
  if (swContainer && typeof swContainer.getRegistrations === "function") {
    try {
      const registrations = await swContainer.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister().catch(() => false)))
    } catch {
      /* ignore — best-effort cleanup */
    }
  }
  const caches = cacheRef.caches
  if (caches && typeof caches.keys === "function") {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
    } catch {
      /* ignore — best-effort cleanup */
    }
  }
}

export function registerServiceWorker(
  env: ServiceWorkerEnv = import.meta.env,
  navigatorRef: ServiceWorkerNavigator = navigator as unknown as ServiceWorkerNavigator,
  windowRef: ServiceWorkerWindow = window,
  cacheRef: CacheGlobal = globalThis as unknown as CacheGlobal,
): boolean {
  if (!navigatorRef.serviceWorker) return false

  // Flag off → make sure no SW is left controlling the page from a prior
  // deploy. This is what gives users an escape from stale caches without
  // asking them to hard-reload.
  if (!isEnabled(env)) {
    void unregisterServiceWorker(navigatorRef, cacheRef)
    return false
  }

  if (!env.PROD) return false

  const swContainer = navigatorRef.serviceWorker

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
