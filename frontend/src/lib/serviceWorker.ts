const SERVICE_WORKER_PATH = '/sw.js'

interface ServiceWorkerEnv {
  PROD?: boolean
}

interface ServiceWorkerNavigator {
  serviceWorker?: {
    register: (scriptURL: string) => Promise<unknown>
  }
}

interface ServiceWorkerWindow {
  addEventListener: Window['addEventListener']
}

export function registerServiceWorker(
  env: ServiceWorkerEnv = import.meta.env,
  navigatorRef: ServiceWorkerNavigator = navigator,
  windowRef: ServiceWorkerWindow = window
): boolean {
  if (!env.PROD || !navigatorRef.serviceWorker) {
    return false
  }

  windowRef.addEventListener(
    'load',
    () => {
      navigatorRef.serviceWorker?.register(SERVICE_WORKER_PATH).catch(() => {
        // Offline support is additive; registration failure should not block the app.
      })
    },
    { once: true }
  )

  return true
}
