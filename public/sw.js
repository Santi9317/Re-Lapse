// Keep RELEASE_VERSION equal to APP_VERSION. A new string is how an installed
// shortcut notices a publish: the next cold open can see a waiting worker.
const RELEASE_VERSION = "1.59";
self.releaseVersion = RELEASE_VERSION;
const CACHE = "relapse-shell-v4";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  // Stay waiting. skipWaiting() here would swap the camera under an open home-screen session.
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Do not delete caches on this swap. On an iOS Home Screen app that delete
  // drops the phone's profile and camera along with the old shell.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // Notes for this publish. A stored copy would describe an older camera.
  if (url.pathname === "/release.json") {
    event.respondWith(fetch(request));
    return;
  }
  // A navigation has to reach the server so the phone cookie is refreshed.
  // Caching that response can swallow the Set-Cookie on the update reload.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((hit) => hit || caches.match("/"))));
    return;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (local) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
  );
});
