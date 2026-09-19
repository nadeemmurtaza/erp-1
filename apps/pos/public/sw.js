// App-shell cache: static assets only, never an API call. A sale that fails
// offline is queued by @newax/pos-core's outbox (see outbox-db.ts) and
// retried explicitly — this worker has no say in that path, on purpose, so
// an asset-caching bug can never silently drop or duplicate a sale.
const CACHE_NAME = 'newax-pos-shell-v1';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept an API call — every /admin/pos/* (and every other API)
  // request must reach the network (or fail loudly) so the outbox, not this
  // worker, decides what happens to a failed sale.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      // Cache-first for the static shell (instant offline load); anything
      // not yet cached falls through to the network attempt above.
      return cached ?? network;
    }),
  );
});
