# Offline use and updates

The coach is an installable PWA. After one online visit it opens and plays without a network connection. This page describes what is cached, how a new deploy reaches learners, and how to recover when something goes wrong.

The code: `scripts/offline-plugin.mjs` (build), `offline/service-worker.js` (worker), `infrastructure/pwa.ts` (page side), `coach/UpdateNotice.tsx` (what the learner sees). The behaviour is pinned by `tests/browser/pwa-lifecycle.spec.js`, which serves two real builds one after the other from a `/Piano-Practice/` path.

## What is cached

The build writes `dist/sw.js` with a precache manifest: every file the learner app (`index.html`) needs — the page, its hashed scripts and styles, the manifest and icons, and the local piano samples (about 2.4 MB in total). The cache is named for a version derived from those files' names and contents, so it changes only when shipped content changes.

Not cached:

- The musical QA audition tool (`audition.html`) and everything only it uses, including the 1.9 MB review corpus. The plugin works this out from the bundle graph, so a new maintainer page is excluded automatically.
- `version.json` (the build stamp), source maps, and the link-preview image.
- The optional network piano libraries (Fuhton, Salamander). They need a connection; the default local pianos do not.

## First visit

The worker registers after the page has loaded, downloads every listed file, revalidating each with the server so a stale HTTP-cached copy is never stored (files the page has just fetched come back as cheap "not modified" answers), and activates at once. The status line then says the coach is saved for offline use. Installation is all-or-nothing: if any file fails, the worker is discarded and the app simply keeps working online; the browser tries again on a later visit.

## Opening the app

- **Page navigations** go to the network first, so a deploy is picked up immediately. If the network fails, or has not answered within 4 seconds, the cached page is used. A weak connection therefore cannot leave a blank screen.
- **Listed files** come from the cache. If one is missing (evicted by the browser, or deleted by hand), it is fetched and put back.
- **Shared links** open offline, including links never opened before: the assignment is decoded and generated on the device.

## How a deploy reaches learners

1. The browser checks `sw.js` for changes when the app is opened, and the app also asks when it returns to the foreground after 30 minutes or more. GitHub Pages serves every file with `Cache-Control: max-age=600`, so a deploy may take **up to about ten minutes** to be noticed.
2. The new worker installs its complete cache alongside the old one. It then **waits**: the open page was built against the old cache.
3. The page asks the waiting worker whether it already contains the script the page is running.
   - **Yes** (the page itself was loaded from the network after the deploy): the new version is activated silently. Nothing on screen is out of date.
   - **No** (the page is the old build, for example opened offline): the page shows _“A new version of the coach is ready — Reload to update.”_ Nothing happens until the learner chooses it, so a deploy never interrupts a practice session. Reloading keeps the assignment, and an interrupted guided session can be continued from Recent practice.
4. On activation the old cache is deleted — only after the new one is complete — and open pages are taken over. A tab left on the old build when another tab updates is offered the same reload.

If the learner ignores the notice, the new version activates by itself once every tab of the app has been closed.

## Recovery

**For a learner whose app looks broken or stale:**

1. Reload once while online. A waiting update applies when you choose _Reload to update_.
2. Close every tab or window of the app and open it again. This activates any waiting version.
3. As a last resort, clear the site's data in the browser settings (for example _Site settings → Clear data_). **This also deletes starred assignments and practice history**, so export history first from _Recent practice → Export history_ if the page still opens.

**For a maintainer:**

- `https://<site>/version.json` shows which commit is deployed and its offline cache version; `sw.js` shows the exact file list.
- A partially uploaded deploy cannot half-install: the worker's install fails and learners stay on the previous version. The deployed smoke suite requests every listed file to catch this.
- To roll back, see [release.md](release.md#rolling-back). Because each version is identified by content, redeploying an older commit produces a cache version learners do not currently have, and it arrives through the same update flow. Stored data is safe across a rollback: see [storage.md](storage.md).

## Development

Service workers are registered only in production builds. Use `npm run build && npm run preview` to try offline behaviour, and _Application → Service workers_ in Chromium DevTools to inspect or unregister it. `npm run dev` never registers a worker.
