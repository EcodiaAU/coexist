/**
 * Service worker for Co-Exist PWA.
 *
 * Strategy:
 *   - Pre-cache: app shell (index.html, offline fallback)
 *   - Cache-first: hashed static assets (/assets/*, content-hashed by Vite)
 *   - Network-first: non-hashed statics (manifest, icons) + HTML navigation
 *   - Skip: Supabase API calls (handled by React Query cache)
 *
 * Cache versioning: bump CACHE_VERSION to force a full cache clear on deploy.
 * Hashed assets are safe to cache indefinitely (new hash = new URL).
 */

// Bump on any sw.js change. v4: route navigation HTML cache through a single
// stable key (/index.html) instead of the visited URL, so deep-link refreshes
// can't surface a stale shell with dead chunk hashes.
const CACHE_VERSION = 4
const SHELL_CACHE = `coexist-shell-v${CACHE_VERSION}`
const ASSET_CACHE = `coexist-assets-v${CACHE_VERSION}`

const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
]

/* ------- Install: pre-cache shell ------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)),
  )
  // Don't skipWaiting() immediately — wait for the client to opt in
  // via postMessage so users aren't surprised by a mid-session reload.
})

/* ------- Activate: clean old caches ------- */

self.addEventListener('activate', (event) => {
  const currentCaches = new Set([SHELL_CACHE, ASSET_CACHE])
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !currentCaches.has(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

/* ------- Message handler: allow clients to trigger skipWaiting ------- */

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

/* ------- Fetch: routing logic ------- */

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET
  if (request.method !== 'GET') return

  // Skip Supabase API / realtime calls
  if (url.hostname.includes('supabase')) return

  // Skip browser extensions, chrome-extension, etc.
  if (!url.protocol.startsWith('http')) return

  // Vite hashed assets (/assets/*): cache-first (hash guarantees uniqueness)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        }).catch(() => {
          return new Response('', { status: 503, statusText: 'Offline' })
        })
      }),
    )
    return
  }

  // Non-hashed static assets (fonts, images not in /assets/): network-first
  // so deployments that change these files don't serve stale versions
  const isStatic = url.pathname.match(
    /\.(woff2?|ttf|eot|otf|png|jpe?g|gif|svg|webp|ico|avif|css|js|mp3|wav|ogg)$/,
  )

  if (isStatic) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then((c) =>
          c || new Response('', { status: 503, statusText: 'Offline' }),
        )),
    )
    return
  }

  // Navigation requests (HTML): network-first with offline fallback.
  //
  // The cached copy is keyed under a single stable URL ('/index.html') rather
  // than the visited route, because the SPA serves the same shell for every
  // route. Caching per-URL meant a deep-link refresh after a deploy could
  // serve a stale shell whose chunk hashes no longer exist on the CDN, which
  // landed users on a permanent white screen.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', clone))
          }
          return response
        })
        .catch(() =>
          caches.match('/index.html').then((cached) =>
            cached || caches.match('/offline.html'),
          ),
        ),
    )
    return
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request)),
  )
})
