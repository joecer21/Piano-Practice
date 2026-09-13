// Offline support. The build (scripts/offline-plugin.mjs) prepends
//   self.PRECACHE_MANIFEST = { version, files }
// listing every file the built app needs - the page, its hashed scripts and
// styles, the icons and the ~1.8 MB local piano samples - and a version that
// changes whenever any of their contents do.
//
// Strategy:
// - Install precaches everything, so the app works offline after one visit.
// - Page navigations go to the network first, so a deploy is picked up at once,
//   and fall back to the cached page offline.
// - Everything else same-origin is served from the precache, else the network.
//   The hashed assets never change under the same name, and the samples change
//   only with a new version.
// - Other origins (the optional network piano libraries) are left alone.
// - Activation deletes caches from earlier versions.

const { version, files } = self.PRECACHE_MANIFEST;
const CACHE_PREFIX = "piano-practice-";
const CACHE_NAME = `${CACHE_PREFIX}${version}`;
const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(files.map(scopeUrl));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          const page =
            (await cache.match(scopeUrl("index.html"), { ignoreVary: true })) ??
            (await cache.match(scopeUrl("./"), { ignoreVary: true }));
          if (page) return page;
          throw error;
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // ignoreVary: servers send Vary (Origin, Accept-Encoding), and a module
      // script's request carries headers the precache request did not, so a strict
      // match would miss every script offline. These files are static.
      return (await cache.match(request, { ignoreVary: true })) ?? fetch(request);
    })(),
  );
});
