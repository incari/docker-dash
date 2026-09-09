// Service Worker for DockerDash PWA
//
// Caching strategy, by request type:
//   /assets/*        cache-first  - Vite emits content-hashed, immutable files,
//                                   so a cache hit is always correct and skips
//                                   the network entirely.
//   navigations      stale-while-revalidate - serve the cached shell instantly,
//                                   refresh it in the background for next load.
//   other statics    stale-while-revalidate - icons, manifest, fonts.
//   /api/settings    network-first, cached fallback (theme survives offline).
//   other /api       network-only, JSON error when offline.
const VERSION = 'v3';
const SHELL_CACHE = `dockerdash-shell-${VERSION}`;
const ASSET_CACHE = `dockerdash-assets-${VERSION}`;
const DATA_CACHE = `dockerdash-data-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE];

const OFFLINE_PAGE = '/offline.html';
const APP_SHELL = '/index.html';

// Files that make up the app shell, cached on install
const PRECACHE_URLS = [
  '/',
  APP_SHELL,
  OFFLINE_PAGE,
  '/manifest.json',
  '/dockericon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll is atomic: one 404 would throw away the whole precache, so each
      // URL is added independently and a missing optional file is tolerated.
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Precache skipped:', url, err);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !CURRENT_CACHES.includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Cache-first: return the cached response if present, otherwise fetch and store.
 * Only used for immutable, content-hashed assets.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Stale-while-revalidate: answer from cache immediately (when available) and
 * refresh the entry in the background so the next load gets fresh content.
 * The event is passed in so the background refresh can outlive the response.
 */
async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);

  const network = fetch(event.request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const response = await network;
  if (response) return response;
  throw new Error('Offline and not cached');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only handle same-origin traffic; let CDN icons and the like go straight out.
  if (url.origin !== self.location.origin) return;

  // ---- API ----------------------------------------------------------------
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/settings')) {
      event.respondWith(settingsWithFallback(event.request));
      return;
    }

    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            JSON.stringify({
              error: 'Offline',
              message: 'Cannot connect to server. Please check your connection.',
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      ),
    );
    return;
  }

  // ---- Hashed build output: safe to serve straight from cache --------------
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      cacheFirst(event.request, ASSET_CACHE).catch(
        () => new Response('', { status: 504, statusText: 'Offline' }),
      ),
    );
    return;
  }

  // ---- Navigations: instant shell, refreshed in the background ------------
  if (event.request.mode === 'navigate') {
    event.respondWith(navigateWithShell(event));
    return;
  }

  // ---- Everything else (icons, manifest, uploads) -------------------------
  event.respondWith(
    staleWhileRevalidate(event, SHELL_CACHE).catch(
      () => new Response('', { status: 404, statusText: 'Not Found' }),
    ),
  );
});

async function settingsWithFallback(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // No cached settings yet: hand back the defaults so the app can still paint.
    return new Response(
      JSON.stringify({
        id: 1,
        theme_primary: '#3b82f6',
        theme_background: '#0f172a',
        view_mode: 'default',
        mobile_columns: 2,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

async function navigateWithShell(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(APP_SHELL);

  const network = fetch(event.request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(APP_SHELL, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const response = await network;
  if (response) return response;

  const offline = await cache.match(OFFLINE_PAGE);
  return offline || new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
