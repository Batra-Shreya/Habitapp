/* Habitat service worker — makes the app installable and usable offline.
   Caches the static app shell; never touches the API (auth + live SSE must
   always hit the network). Bump CACHE when shell files change. */

const CACHE = "habitat-shell-v1";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "api.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  // Let the network handle everything dynamic: the API, the SSE stream, and
  // any cross-origin request. Only the same-origin static shell is cached.
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== location.origin) {
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const res = await fetch(event.request);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
      }
      return res;
    } catch {
      // Offline and not cached: fall back to the app shell for navigations.
      if (event.request.mode === "navigate") return caches.match("index.html");
      return Response.error();
    }
  })());
});
