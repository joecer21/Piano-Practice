// Measures real loading behaviour of the production build, so budgets and lazy-
// loading decisions come from evidence rather than a bundler warning.
//
//   npm run build && npm run perf            # 5 runs per profile, prints a table
//   npm run perf -- --runs 9 --json out.json # more runs, machine-readable output
//
// Each run uses a fresh browser context against `vite preview`. Profiles:
//   desktop - no throttling
//   phone   - Pixel 7 viewport, 4x CPU slowdown, "slow 4G" network
// Milestones are measured from navigation start, in the page's own clock:
//   sentence    - the assignment sentence has rendered (React mounted, assignment built)
//   pianoReady  - "Start 5 minutes" is enabled (samples decoded; first playable moment)
//   workspace   - clicking "Change the assignment" shows the editor (interaction latency)
//   swControl   - the service worker has installed and controls the page
//   cachedReady - after a reload served by the service worker, "Start" is enabled again
// plus CDP ScriptDuration (JS evaluation) up to pianoReady and transferred bytes by kind.
/* global document -- used inside functions evaluated in the browser page */
import { existsSync, writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";
import { preview } from "vite";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const RUNS = Number(option("runs", 5));
const JSON_OUT = option("json", null);
const PORT = Number(option("port", 4180));
const BASE = option("url", `http://127.0.0.1:${PORT}/`);

const PROFILES = {
  desktop: { context: { viewport: { width: 1280, height: 800 } }, cpu: 1, network: null },
  phone: {
    context: { ...devices["Pixel 7"] },
    cpu: 4,
    // Chrome DevTools' "Slow 4G" preset.
    network: {
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    },
  },
};

/** Serve dist/ in-process with the installed Vite: no shell, no child process. */
async function startPreview() {
  if (option("url", null)) return null;
  if (!existsSync("dist/index.html")) throw new Error("Run `npm run build` first.");
  return preview({
    logLevel: "silent",
    preview: { host: "127.0.0.1", port: PORT, strictPort: true },
  });
}

const sinceNavigation = (page) => page.evaluate(() => performance.now());

async function waitForPianoReady(page) {
  await page.getByRole("button", { name: "Start 5 minutes" }).waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(
    () => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Start 5 minutes",
      );
      return button && !button.disabled;
    },
    null,
    { polling: 16, timeout: 120_000 },
  );
  return sinceNavigation(page);
}

async function throttledPage(browser, profile, contextOptions = {}) {
  const context = await browser.newContext({ ...profile.context, ...contextOptions });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  if (profile.network) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...profile.network });
  }
  return { context, page, cdp };
}

async function measureOnce(browser, profile) {
  // Cold first visit with service workers blocked: page-level network throttling
  // does not apply to a worker, whose unthrottled precache would otherwise fill
  // the HTTP cache and make the page's own sample downloads look free.
  const { context, page, cdp } = await throttledPage(browser, profile, { serviceWorkers: "block" });

  const bytes = { script: 0, stylesheet: 0, media: 0, other: 0 };
  let counting = true;
  page.on("requestfinished", async (request) => {
    if (!counting) return;
    const sizes = await request.sizes().catch(() => null);
    if (!sizes) return;
    const type = request.resourceType();
    const kind =
      type === "script" || type === "stylesheet" ? type : /\.mp3$/.test(request.url()) ? "media" : "other";
    bytes[kind] += sizes.responseBodySize + sizes.responseHeadersSize;
  });

  await page.goto(BASE, { waitUntil: "commit" });
  await page
    .getByTestId("coach-sentence")
    .filter({ hasText: /major|minor|pentatonic|blues/ })
    .waitFor({ timeout: 120_000 });
  const sentence = await sinceNavigation(page);
  const pianoReady = await waitForPianoReady(page);
  counting = false;
  const { metrics } = await cdp.send("Performance.getMetrics");
  const scriptMs = Math.round(
    (metrics.find((metric) => metric.name === "ScriptDuration")?.value ?? 0) * 1000,
  );

  const clickAt = await sinceNavigation(page);
  await page.locator("#assignment-workspace > summary").click();
  await page.getByRole("button", { name: "Apply assignment" }).waitFor({ state: "visible" });
  const workspace = (await sinceNavigation(page)) - clickAt;
  await context.close();

  // Offline install and a reload served by the worker, in a fresh context.
  const offline = await throttledPage(browser, profile);
  await offline.page.goto(BASE, { waitUntil: "commit" });
  await offline.page.evaluate(() => navigator.serviceWorker.ready);
  await offline.page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 60_000,
  });
  const swControl = await sinceNavigation(offline.page);
  await offline.page.reload({ waitUntil: "commit" });
  const cachedReady = await waitForPianoReady(offline.page);
  await offline.context.close();
  return { sentence, pianoReady, workspace, swControl, cachedReady, scriptMs, bytes };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const server = await startPreview();
const browser = await chromium.launch();
const results = {};
try {
  for (const [name, profile] of Object.entries(PROFILES)) {
    const runs = [];
    for (let run = 0; run < RUNS; run += 1) runs.push(await measureOnce(browser, profile));
    const summary = {};
    for (const key of ["sentence", "pianoReady", "workspace", "swControl", "cachedReady", "scriptMs"]) {
      summary[key] = Math.round(median(runs.map((result) => result[key])));
    }
    summary.kilobytes = Object.fromEntries(
      Object.keys(runs[0].bytes).map((kind) => [
        kind,
        Math.round(median(runs.map((r) => r.bytes[kind])) / 1024),
      ]),
    );
    results[name] = { runs: RUNS, median: summary };
  }
} finally {
  await browser.close();
  await server?.close();
}

console.log(`Median of ${RUNS} runs against ${BASE}`);
console.table(
  Object.fromEntries(
    Object.entries(results).map(([name, { median: m }]) => [
      name,
      {
        "sentence ms": m.sentence,
        "piano ready ms": m.pianoReady,
        "JS eval ms": m.scriptMs,
        "open editor ms": m.workspace,
        "SW controls ms": m.swControl,
        "cached ready ms": m.cachedReady,
        "JS KB": m.kilobytes.script,
        "CSS KB": m.kilobytes.stylesheet,
        "samples KB": m.kilobytes.media,
      },
    ]),
  ),
);
if (JSON_OUT) writeFileSync(JSON_OUT, `${JSON.stringify(results, null, 2)}\n`);
