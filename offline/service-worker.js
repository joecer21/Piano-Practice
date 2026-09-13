// Offline support. The build (scripts/offline-plugin.mjs) prepends
//   self.PRECACHE_MANIFEST = { version, files }
// listing every file the learner app needs - the page, its hashed scripts and
// styles, the icons and the local piano samples - and a version that changes
// whenever any of their contents do. Maintainer-only pages (the musical QA
// audition tool and its corpus) are deliberately not listed.
//
// Lifecycle:
// - Install downloads every listed file into a cache named for this version,
//   revalidating each with the server (cache: "no-cache") so a new version never
//   stores a stale copy, while files the page has just downloaded come back as
//   cheap "not modified" answers rather than full downloads. The
//   install is all-or-nothing: if any file fails, this worker is discarded and
//   the previous version keeps serving; the browser retries on a later visit.
// - The very first install activates at once. An upgrade waits, because the page
//   that is open was built against the previous cache. The page activates it by
//   posting SKIP_WAITING - silently when it is already running the new build,
//   otherwise when the learner chooses to reload (see infrastructure/pwa.ts).
// - Activation deletes caches from other versions, only after the new cache is
//   complete, and takes control of open pages.
//
// Requests:
// - Page navigations go to the network first so a deploy is seen at once, but
//   fall back to the cached page when offline or when the network has not
//   answered within NAVIGATION_TIMEOUT_MS (a weak connection must not leave a
//   blank screen for a minute).
// - Listed files are served from this version's cache. A listed file missing from
//   the cache (evicted, or removed by hand) is fetched and put back.
// - Anything else - other origins such as the optional network piano libraries,
//   and unlisted same-origin files - is left to the browser.

const { version, files } = self.PRECACHE_MANIFEST;
const CACHE_PREFIX = "piano-practice-";
const CACHE_NAME = `${CACHE_PREFIX}${version}`;
const NAVIGATION_TIMEOUT_MS = 4000;
const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const withoutSearch = (href) => {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  return url.href;
};
const precached = new Set(files.map(scopeUrl));
const appPage = scopeUrl("index.html");

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(files.map((file) => new Request(scopeUrl(file), { cache: "no-cache" })));
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (message?.type === "DESCRIBE") {
    // Lets a page ask whether this version already includes the script it is running.
    const includes = typeof message.url === "string" && precached.has(withoutSearch(message.url));
    event.ports[0]?.postMessage({ version, includes });
  }
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
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const target = withoutSearch(request.url);
    if (target === appPage || target === self.registration.scope) event.respondWith(navigateToApp(request));
    return;
  }

  if (precached.has(withoutSearch(request.url))) event.respondWith(fromPrecache(request));
});

async function navigateToApp(request) {
  const network = fetch(request);
  // If the cached page wins the race, a later network failure is expected, not unhandled.
  network.catch(() => {});
  const cached = async () => (await caches.open(CACHE_NAME)).match(appPage, { ignoreVary: true });
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(resolve, NAVIGATION_TIMEOUT_MS, "timeout");
  });
  try {
    const winner = await Promise.race([network, timedOut]);
    if (winner !== "timeout") return winner;
    return (await cached()) ?? (await network);
  } catch (error) {
    const page = await cached();
    if (page) return page;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fromPrecache(request) {
  const cache = await caches.open(CACHE_NAME);
  // ignoreVary: servers send Vary (Origin, Accept-Encoding), and a module script's
  // request carries headers the precache request did not, so a strict match would
  // miss every script offline. ignoreSearch: listed files are static.
  const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(withoutSearch(request.url), response.clone()).catch(() => {});
  }
  return response;
}
