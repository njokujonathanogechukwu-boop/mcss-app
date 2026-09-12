// Minimal service worker: makes the phone app installable and serves a small
// offline fallback for the app shell. Record data is never cached — every
// report and edit goes straight to the server so nothing is ever stale.
const SHELL_CACHE = "mcss-shell-v1";
const SHELL_ASSETS = ["/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only handle GET navigations for same-origin static icons; let everything
  // else (data, actions, auth) hit the network untouched.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
