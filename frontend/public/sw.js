const CACHE_VERSION = 'breathflow-offline-v2'
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const KOREA_API_CACHE = `${CACHE_VERSION}-korea-api`
const APP_SHELL = [
  '/',
  '/breathwork',
  '/breathwork/progress',
  '/breathwork/session?technique=cyclic_sighing&rounds=30',
  '/breathwork/session?technique=four_seven_eight&rounds=16',
  '/korea',
  '/korea.webmanifest',
  '/site.webmanifest',
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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('breathflow-offline-') &&
                key !== CACHE_VERSION &&
                key !== RUNTIME_CACHE &&
                key !== KOREA_API_CACHE,
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

// Stale-while-revalidate for Korea data. Lets the page render instantly from
// cache while a fresh copy is fetched in the background; falls back to the
// cached copy when offline.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(KOREA_API_CACHE)
  const cached = await cache.match(request)
  const networked = fetch(request)
    .then((response) => {
      if (response.ok) cachePutSafe(cache, request, response.clone())
      return response
    })
    .catch(() => cached || Response.error())
  return cached || networked
}

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

  // Korea API gets a stale-while-revalidate strategy so /korea works offline.
  if (url.pathname.startsWith('/api/korea')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  if (url.pathname.startsWith('/api/')) {
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
