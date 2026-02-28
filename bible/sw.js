// @ts-check
const APP_CACHE = 'bible-app';
const DATA_CACHE = 'bible-data';

const APP_FILES = [
  './',
  './index.html',
  './app.js',
  '../ui.js',
  './data/books.json',
];

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

const DATA_FILES = BOOK_IDS.map(id => `./data/${id}.txt`);
const KEEP_CACHES = new Set([APP_CACHE, DATA_CACHE]);

self.addEventListener('install', (/** @type {any} */ e) => {
  e.waitUntil(Promise.all([
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_FILES)),
    caches.open(DATA_CACHE).then(cache => cache.addAll(DATA_FILES)),
  ]));
  /** @type {any} */ (self).skipWaiting();
});

// Clean up old caches, then reload all clients
self.addEventListener('activate', (/** @type {any} */ e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP_CACHES.has(k)).map(k => caches.delete(k))))
      .then(() => /** @type {any} */ (self).clients.claim())
      .then(() => /** @type {any} */ (self).clients.matchAll())
      .then((/** @type {any[]} */ clients) => clients.forEach(c => c.navigate(c.url)))
  );
});

// Network-first: try network, fall back to cache
self.addEventListener('fetch', (/** @type {any} */ e) => {
  const cacheName = e.request.url.includes('/data/') ? DATA_CACHE : APP_CACHE;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(cacheName).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
