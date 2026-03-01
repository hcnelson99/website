// @ts-check
const APP_CACHE = 'bible-app-v1772389500';
const DATA_CACHE = 'bible-data-v2';
const CACHES = [APP_CACHE, DATA_CACHE];

const APP_FILES = ['./', './index.html', './app.js', '../ui.js', './data/books.json'];

/** @param {Request} req */
function cacheFor(req) {
  return new URL(req.url).pathname.match(/\/data\/.*\.txt$/) ? DATA_CACHE : APP_CACHE;
}

self.addEventListener('install', (/** @type {any} */ e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then(async cache => {
      await cache.addAll(APP_FILES);
      const res = /** @type {Response} */ (await cache.match('./data/books.json'));
      const books = /** @type {{ id: string }[]} */ (await res.json());
      return caches.open(DATA_CACHE).then(dc => dc.addAll([
        ...books.map(b => `./data/kjv/${b.id}.txt`),
        ...books.map(b => `./data/niv/${b.id}.txt`),
      ]));
    })
  );
  /** @type {any} */ (self).skipWaiting();
});

// Clean up old caches, then reload all clients
self.addEventListener('activate', (/** @type {any} */ e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !CACHES.includes(k)).map(k => caches.delete(k))))
      .then(() => /** @type {any} */ (self).clients.claim())
      .then(() => /** @type {any} */ (self).clients.matchAll())
      .then((/** @type {any[]} */ clients) => clients.forEach(c => c.navigate(c.url)))
  );
});

// Cache-first: serve from cache, only fetch if not cached
self.addEventListener('fetch', (/** @type {any} */ e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
