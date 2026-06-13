const CACHE = 'hp-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(self.clients.claim())
);

// Network-first: always fetch fresh files when online,
// fall back to cache only if the network is unavailable.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok || r.type === 'opaque') {
          caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
