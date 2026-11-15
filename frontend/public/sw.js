// Korea is now the only installable PWA — bump cache version so iOS
// clients drop the previously-precached BreathFlow manifest.
const CACHE_VERSION = 'korea-offline-v15'
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const APP_SHELL = [
  '/',
  '/breathwork',
  '/breathwork/progress',
  '/breathwork/session?technique=cyclic_sighing&rounds=30',
  '/breathwork/session?technique=four_seven_eight&rounds=16',
  '/trips',
  '/trips/korea-2026',
  '/korea.webmanifest',
  '/favicon-breath.svg',
  '/favicon-chat.svg',
  '/apple-touch-icon.png',
  '/icons/breathflow-192.png',
  '/icons/breathflow-512.png',
  '/robots.txt',
  '/sitemap.xml',
]
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'font', 'image', 'manifest'])

function cachePutSafe(cache, request, response) {
  return cache.put(request, response).catch(() => undefined)
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_VERSION)
  await Promise.allSettled(
    APP_SHELL.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' })
      if (response.ok) {
        await cachePutSafe(cache, url, response)
      }
    })
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting())
  )
})

// Allow the client (registerServiceWorker.ts) to tell us to skip waiting.
// This is the second leg of the auto-update flow: when a new SW is installed
// and waiting, the client posts SKIP_WAITING and we hand control to the new
// SW immediately. The `controllerchange` listener on the client then reloads.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith('breathflow-offline-') ||
                  key.startsWith('korea-offline-')) &&
                key !== CACHE_VERSION &&
                key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Force open clients to reload so they pick up the new asset bundle
        // hashes referenced by the fresh index.html. Without this, an SPA
        // session loaded under the old SW would keep using stale lazy chunks.
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            try {
              client.navigate(client.url)
            } catch {
              /* navigate is restricted on some clients; ignore */
            }
          })
        })
      })
  )
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_VERSION)

  try {
    const response = await fetch(request)
    if (response.ok) {
      await cachePutSafe(cache, request, response.clone())
    }
    return response
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match('/breathwork')) ||
      (await cache.match('/')) ||
      Response.error()
    )
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }

  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(RUNTIME_CACHE)
    void cachePutSafe(cache, request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }

  // Remote PR previews must never be intercepted — they live under
  // /preview/pr/:n/ with their own hashed assets. Caching them in the
  // production SW would pin reviewers to a stale preview (or worse,
  // serve production HTML for a preview URL).
  if (url.pathname === '/preview' || url.pathname.startsWith('/preview/')) {
    return
  }

  // Never intercept the SW script itself — the browser uses a special update
  // path that bypasses the existing SW, but we belt-and-suspender it.
  if (url.pathname === '/sw.js') {
    return
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__clerk/')) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination) || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  }
})
