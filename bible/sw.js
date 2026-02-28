// @ts-check
const CACHE = 'bible-v1';

const APP_FILES = ['./', './index.html', './app.js', '../ui.js', './data/books.json'];

self.addEventListener('install', (/** @type {any} */ e) => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      await cache.addAll(APP_FILES);
      const res = /** @type {Response} */ (await cache.match('./data/books.json'));
      const books = /** @type {{ id: string }[]} */ (await res.json());
      await cache.addAll(books.map(b => `./data/${b.id}.txt`));
    })
  );
  /** @type {any} */ (self).skipWaiting();
});

// Clean up old caches, then reload all clients
self.addEventListener('activate', (/** @type {any} */ e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => /** @type {any} */ (self).clients.claim())
      .then(() => /** @type {any} */ (self).clients.matchAll())
      .then((/** @type {any[]} */ clients) => clients.forEach(c => c.navigate(c.url)))
  );
});

// Stale-while-revalidate: serve from cache, refresh in background
self.addEventListener('fetch', (/** @type {any} */ e) => {
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fetched = fetch(e.request).then(res => {
          cache.put(e.request, res.clone());
          return res;
        });
        return cached || fetched;
      })
    )
  );
});
