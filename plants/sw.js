// Service worker: offline app shell + push notifications.
const CACHE = "plants-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first so updates land quickly; cache fallback for offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});

// iOS requires every received push to show a notification.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "🪴 Plant watering time!";
  const body = data.body || "Some of your plants need water.";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: "icon-192.png",
        badge: "icon-192.png",
        tag: "plants-due",
      }),
      "setAppBadge" in navigator && data.count ? navigator.setAppBadge(data.count).catch(() => {}) : Promise.resolve(),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes("/plants"));
      return existing ? existing.focus() : self.clients.openWindow("./");
    })
  );
});
