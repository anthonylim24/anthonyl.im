// Korea is the only installable PWA, but this worker serves every app's shell
// offline. Bump CACHE_VERSION on every behaviour change (AGENTS.md, "Service
// Worker / Caching Contract").
const CACHE_VERSION = 'korea-offline-v16'
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
// Hashed bundles pile up across deploys; activate trims the oldest beyond this.
const RUNTIME_MAX_ENTRIES = 150

// One cached shell per app (see shellKey). Precached so a first offline
// launch of any app works.
const APP_SHELL = [
  '/',
  '/lab',
  '/breathwork',
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

// Server-rendered HTML that is not the SPA shell (server/src/staticPages.ts;
// server/src/staticPages.test.ts fails when the two lists drift).
const STATIC_PAGES = new Set(['/home', '/privacy', '/terms', '/sms-consent'])

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

// No skipWaiting() here: an update waits until the page says it is safe to
// swap (lib/serviceWorker.ts posts SKIP_WAITING), so a deploy never reloads a
// tab mid-chat or mid-breath. The first install activates straight away
// because there is no older worker to wait for.
self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell())
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function pruneRuntimeCache() {
  const cache = await caches.open(RUNTIME_CACHE)
  const keys = await cache.keys()
  // keys() lists in insertion order, so the oldest go first.
  const excess = keys.length - RUNTIME_MAX_ENTRIES
  if (excess > 0) {
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
  }
}

// Pages reload themselves (controllerchange in lib/serviceWorker.ts) when it
// is safe to; the worker never navigates a client.
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
      .then(() => pruneRuntimeCache())
      .then(() => self.clients.claim())
  )
})

/**
 * The cache key for a navigation. Every SPA route is the same index.html
 * (only the server-injected preview tags differ per app), so each app keeps
 * one copy under its root, without the query: invite tokens and shared links
 * (`?instagram=`, `?url=`) never reach Cache Storage. `null` means do not
 * store this response.
 */
function shellKey(pathname) {
  if (pathname.startsWith('/trips/join/') || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) {
    return null
  }
  if (STATIC_PAGES.has(pathname)) return pathname
  // A file opened directly (robots.txt, an image) is not a shell.
  if (/\.[a-z0-9]+$/i.test(pathname)) return null
  if (pathname.startsWith('/breathwork')) return '/breathwork'
  if (pathname.startsWith('/trips/korea-2026') || pathname.startsWith('/korea')) return '/trips/korea-2026'
  if (pathname.startsWith('/trips')) return '/trips'
  if (pathname === '/lab') return '/lab'
  return '/'
}

async function networkFirstNavigation(request, pathname) {
  const cache = await caches.open(CACHE_VERSION)
  const key = shellKey(pathname)

  try {
    const response = await fetch(request)
    const isHtml = (response.headers.get('Content-Type') || '').includes('text/html')
    if (key && response.ok && isHtml) {
      await cachePutSafe(cache, key, response.clone())
    }
    return response
  } catch {
    return (
      (key && (await cache.match(key))) ||
      (await cache.match('/')) ||
      Response.error()
    )
  }
}

// Content-hashed bundles never change under a name.
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

// Unhashed public files (favicons, /og-*.jpg, /legal.css, the manifest) can
// change in place: answer from cache, refresh it behind the scenes.
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = (await cache.match(request)) || (await caches.match(request))
  const networked = fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      return cachePutSafe(cache, request, response.clone()).then(() => response)
    }
    return response
  })
  if (cached) {
    event.waitUntil(networked.catch(() => undefined))
    return cached
  }
  return networked
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
    event.respondWith(networkFirstNavigation(request, url.pathname))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(event, request))
  }
})
