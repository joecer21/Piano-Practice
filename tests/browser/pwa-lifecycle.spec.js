// The offline lifecycle across real deploys: two builds of the application served
// one after the other from a GitHub Pages-like project path (built once by
// tests/browser/pwa/global-setup.js). These are the behaviours a single build
// cannot show - upgrading, recovering and staying usable on a poor connection.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PWA_BUILDS } from "./pwa/global-setup.js";

const BASE_PATH = "/Piano-Practice/";
const OUT = PWA_BUILDS;
const MINOR_BLUES =
  "v=1&key=A&mode=minorBlues&prog=blues-12-minor&style=jazz&lh=root-5th-oct&motif=blues-riff-minor&len=12&seed=shared-link&preset=blues-a";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
};

test.describe.configure({ mode: "serial" });

/** @type {{ root: string, pageDelayMs: number, requests: string[] }} */
const deployment = { root: "", pageDelayMs: 0, requests: [] };
let server;
let origin;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith(BASE_PATH)) {
      response.writeHead(404).end();
      return;
    }
    const relative = normalize(decodeURIComponent(url.pathname.slice(BASE_PATH.length)) || "index.html");
    const file = join(deployment.root, relative.endsWith("/") ? `${relative}index.html` : relative);
    if (relative.startsWith("..") || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    deployment.requests.push(relative);
    const send = () => {
      // Like GitHub Pages, files are HTTP-cacheable for ten minutes, which the
      // worker must not trust when it installs a new version. The worker script
      // itself is served uncached so update checks are deterministic here; on
      // GitHub Pages a deploy can take up to those ten minutes to be noticed.
      const cacheControl = relative === "sw.js" ? "no-cache" : "max-age=600";
      response.writeHead(200, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
        "Cache-Control": cacheControl,
      });
      createReadStream(file).pipe(response);
    };
    if (relative === "index.html" && deployment.pageDelayMs) setTimeout(send, deployment.pageDelayMs);
    else send();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

test.beforeEach(() => {
  deployment.root = join(OUT, "a");
  deployment.pageDelayMs = 0;
  deployment.requests = [];
});

const appUrl = (fragment = "") => `${origin}${BASE_PATH}${fragment ? `#${fragment}` : ""}`;
const label = (page) => page.evaluate(() => globalThis.__PWA_TEST_LABEL__);
const cacheNames = (page) => page.evaluate(() => caches.keys());

async function waitForControl(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function expectReady(page) {
  await expect(page.getByTestId("coach-sentence")).toContainText(/major|minor|pentatonic|blues/);
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeEnabled({ timeout: 15_000 });
}

test("the first visit installs, is installable, and says it now works offline", async ({ page }) => {
  await page.goto(appUrl());
  await expectReady(page);
  await waitForControl(page);
  await expect(page.locator("#status-line")).toContainText("Saved for offline use");
  expect(await cacheNames(page)).toHaveLength(1);

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);

  // The maintainer-only audition tool and its corpus are not downloaded for learners.
  const cached = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cached.some((path) => path.includes("audition") || path.includes("corpus"))).toBe(false);
  expect(cached).toContain(`${BASE_PATH}samples/a4vl.mp3`);
});

test("offline, a link never opened before still opens its assignment", async ({ page, context }) => {
  await page.goto(appUrl());
  await expectReady(page);
  await waitForControl(page);

  await context.setOffline(true);
  await page.goto(appUrl(MINOR_BLUES));
  await expect(page.getByTestId("coach-sentence")).toContainText(/^A minor blues\./);
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeEnabled({ timeout: 15_000 });
});

test("a page that already loaded the new deploy adopts the new cache without asking", async ({
  page,
  context,
}) => {
  await page.goto(appUrl());
  await waitForControl(page);
  const [firstCache] = await cacheNames(page);

  deployment.root = join(OUT, "b");
  await page.reload();
  await expectReady(page);
  expect(await label(page)).toBe("b");

  await expect.poll(() => cacheNames(page), { timeout: 15_000 }).not.toContain(firstCache);
  expect(await cacheNames(page)).toHaveLength(1);
  await expect(page.getByTestId("update-notice")).toHaveCount(0);

  await context.setOffline(true);
  await page.reload();
  await expectReady(page);
  expect(await label(page)).toBe("b");
});

test("a page running the old deploy is offered the update and reloads only when asked", async ({
  page,
  context,
}) => {
  await page.goto(appUrl());
  await waitForControl(page);
  const [firstCache] = await cacheNames(page);

  // Opened offline from the cache, then the connection returns after a deploy.
  await context.setOffline(true);
  await page.reload();
  await expectReady(page);
  deployment.root = join(OUT, "b");
  await context.setOffline(false);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());

  const notice = page.getByTestId("update-notice");
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(notice).toContainText("A new version of the coach is ready");
  await expect(notice.locator("xpath=..")).toHaveAttribute("role", "status");
  await page.evaluate(() => window.scrollTo(0, 0));
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  // Nothing happens on its own: after a pause the new version is still waiting,
  // the page is still the old build, and the cache it depends on is intact.
  await page.waitForTimeout(2000);
  const waiting = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { waiting: registration.waiting?.state ?? null, cachesLeft: (await caches.keys()).length };
  });
  expect(waiting).toEqual({ waiting: "installed", cachesLeft: 2 });
  expect(await label(page)).toBe("a");
  expect(await cacheNames(page)).toContain(firstCache);

  await page.getByRole("button", { name: "Reload to update" }).click();
  await page.waitForFunction(() => globalThis.__PWA_TEST_LABEL__ === "b", null, { timeout: 15_000 });
  await expectReady(page);
  await expect(page.getByTestId("update-notice")).toHaveCount(0);
  await expect.poll(() => cacheNames(page)).not.toContain(firstCache);

  await context.setOffline(true);
  await page.reload();
  await expectReady(page);
  expect(await label(page)).toBe("b");
});

test("a slow network does not hold the app hostage when a cached copy exists", async ({ page }) => {
  await page.goto(appUrl());
  await waitForControl(page);

  deployment.pageDelayMs = 20_000;
  const started = Date.now();
  await page.reload({ waitUntil: "commit" });
  await expectReady(page);
  expect(Date.now() - started).toBeLessThan(12_000);
});

test("a cache missing some files repairs itself instead of breaking offline use", async ({
  page,
  context,
}) => {
  await page.goto(appUrl());
  await expectReady(page);
  await waitForControl(page);
  const removed = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    const victims = (await cache.keys()).filter((request) =>
      /\/assets\/.*\.js$|a4vl\.mp3$/.test(request.url),
    );
    await Promise.all(victims.map((request) => cache.delete(request)));
    return victims.length;
  });
  expect(removed).toBeGreaterThan(1);

  await page.reload();
  await expectReady(page);

  // Only the service-worker cache may answer offline, not the browser's HTTP cache.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await context.setOffline(true);
  await page.reload();
  await expectReady(page);
  const sample = await page.evaluate(async () => (await fetch("samples/a4vl.mp3")).ok);
  expect(sample).toBe(true);
});
