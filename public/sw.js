const CACHE = 'hp-v1';

// Static assets to pre-cache on install
const PRECACHE = [
  '/',
  '/style.css',
  '/app.js',
  '/hidden-perks-logo-2.jpg',
  '/manifest.json',
  '/icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-first for API calls — cache the response so it's available offline
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (static assets, Google Fonts)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((r) => {
        if (r.ok || r.type === 'opaque') {
          caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        }
        return r;
      });
    })
  );
});
