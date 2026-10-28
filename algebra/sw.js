// Offline cache for the reader. The page is served from cache immediately and
// refreshed in the background, so a slow network never delays opening the book.
// Bump VERSION to force installed copies to drop everything and re-download.
const VERSION = 'algebra-v2';
const PAGE = './algebra.html';
const PRECACHE = [PAGE, './manifest.webmanifest', './icon-180.png', './icon-512.png'];
// Same URL as the stylesheet <link> in algebra.html (&amp; decoded).
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400;0,600;0,700;1,400;1,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Fetch the font stylesheet and every font file it references, so the very
// first offline (or slow) launch already has them. Best effort: never fails install.
async function precacheFonts(cache) {
  try {
    const res = await fetch(FONT_CSS, { mode: 'cors' });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(urls.map((u) => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
  } catch (_) {}
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))).then(() => precacheFonts(c)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Revalidate the page in the background. 'no-cache' sends If-None-Match /
// If-Modified-Since, so an unchanged page costs a tiny 304, not 8MB.
function refreshPage() {
  return fetch(PAGE, { cache: 'no-cache' })
    .then((res) => { if (res.ok) return caches.open(VERSION).then((c) => c.put(PAGE, res)); })
    .catch(() => {});
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: cached copy instantly, update for next launch in the background.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith(
      caches.match(PAGE).then((hit) => {
        if (hit) {
          e.waitUntil(refreshPage());
          return hit;
        }
        return fetch(req);
      })
    );
    return;
  }

  // Fonts and local assets: cache first, fill the cache on first use.
  if (url.origin === self.location.origin || FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
