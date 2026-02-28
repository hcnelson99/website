// @ts-check
const CACHE = 'bible-v1';

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

const ALL_FILES = [...APP_FILES, ...BOOK_IDS.map(id => `./data/${id}.txt`)];

// Pre-cache everything on install
self.addEventListener('install', (/** @type {any} */ e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ALL_FILES))
  );
  /** @type {any} */ (self).skipWaiting();
});

// Clean up old caches on activate
self.addEventListener('activate', (/** @type {any} */ e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  /** @type {any} */ (self).clients.claim();
});

// Network-first: try network, fall back to cache
self.addEventListener('fetch', (/** @type {any} */ e) => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
