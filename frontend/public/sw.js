// Service Worker for DockerDash PWA
const CACHE_NAME = 'dockerdash-v2';
const OFFLINE_PAGE = '/offline.html';

// Essential files to cache on install
const urlsToCache = [
  '/',
  '/index.html',
  '/dockericon.png',
  '/icon-192.png',
  '/icon-512.png',
  OFFLINE_PAGE
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential files');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('[SW] Cache install failed:', err);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - Network first, fallback to cache, then offline page
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Handle API requests separately
  if (event.request.url.includes('/api/')) {
    // Special handling for settings API - cache for offline use
    if (event.request.url.includes('/api/settings')) {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            // Cache settings response for offline use
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            return response;
          })
          .catch(() => {
            // Try to return cached settings when offline
            return caches.match(event.request)
              .then((cachedResponse) => {
                if (cachedResponse) {
                  console.log('[SW] Returning cached settings (offline mode)');
                  return cachedResponse;
                }
                // Fallback to localStorage-based theme
                return new Response(
                  JSON.stringify({
                    id: 1,
                    theme_primary: '#3b82f6',
                    theme_background: '#0f172a',
                    view_mode: 'default',
                    mobile_columns: 2
                  }),
                  {
                    status: 200,
                    headers: new Headers({
                      'Content-Type': 'application/json'
                    })
                  }
                );
              });
          })
      );
      return;
    }

    // For other API requests, return error when offline
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Return a JSON error response when API is offline
          return new Response(
            JSON.stringify({
              error: 'Offline',
              message: 'Cannot connect to server. Please check your connection.'
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'application/json'
              })
            }
          );
        })
    );
    return;
  }

  // Handle navigation requests (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful responses
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Try cache first, then offline page
          return caches.match(event.request)
            .then((response) => {
              return response || caches.match(OFFLINE_PAGE);
            });
        })
    );
    return;
  }

  // Handle all other requests (CSS, JS, images, etc.)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // For images, return a placeholder or nothing
            if (event.request.destination === 'image') {
              return new Response('', {
                status: 404,
                statusText: 'Not Found'
              });
            }
            // For other resources, return empty response
            return new Response('', {
              status: 404,
              statusText: 'Not Found'
            });
          });
      })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

