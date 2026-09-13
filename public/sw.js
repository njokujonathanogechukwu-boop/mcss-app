// Minimal service worker. Its only job is to make the phone app installable by
// serving the manifest icons from cache. There is deliberately no offline
// support: no page, no navigation and no record data is ever cached, so an
// installed app with no connection simply fails to load rather than showing
// stale congregation records.
const ICON_CACHE = "mcss-icons-v1";
const ICON_ASSETS = ["/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(ICON_CACHE).then((cache) => cache.addAll(ICON_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== ICON_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only the two icons are served from cache. Everything else — navigations,
  // server actions, auth — is left to the network untouched.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (ICON_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
