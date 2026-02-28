// @ts-check
const CACHE = 'bible-v1';

const BOOK_IDS = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua',
  'judges', 'ruth', '1samuel', '2samuel', '1kings', '2kings', '1chronicles',
  '2chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'proverbs',
  'ecclesiastes', 'songofsolomon', 'isaiah', 'jeremiah', 'lamentations',
  'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah',
  'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
  'matthew', 'mark', 'luke', 'john', 'acts', 'romans', '1corinthians',
  '2corinthians', 'galatians', 'ephesians', 'philippians', 'colossians',
  '1thessalonians', '2thessalonians', '1timothy', '2timothy', 'titus',
  'philemon', 'hebrews', 'james', '1peter', '2peter', '1john', '2john',
  '3john', 'jude', 'revelation',
];

const ALL_FILES = [
  './',
  './index.html',
  './app.js',
  '../ui.js',
  './data/books.json',
  ...BOOK_IDS.map(id => `./data/${id}.txt`),
];

self.addEventListener('install', (/** @type {any} */ e) => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ALL_FILES)));
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
