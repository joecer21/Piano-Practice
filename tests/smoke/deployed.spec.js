// What must be true of a deployed build before it is tagged as a release. Paths are
// relative, so the suite works at a domain root and under a project path.
import { expect, test } from "@playwright/test";

const MINOR_BLUES =
  "v=1&key=A&mode=minorBlues&prog=blues-12-minor&style=jazz&lh=root-5th-oct&motif=blues-riff-minor&len=12&seed=shared-link&preset=blues-a";

async function expectReady(page) {
  await expect(page.getByTestId("coach-sentence")).toContainText(/major|minor|pentatonic|blues/);
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeEnabled({ timeout: 30_000 });
}

test("the deployed build is the expected one, and every offline file it lists is served", async ({
  request,
}) => {
  const stamp = await request.get("version.json");
  expect(stamp.status(), "version.json is missing: this deploy predates build stamps").toBe(200);
  const info = await stamp.json();
  expect(info).toMatchObject({ version: expect.any(String), cacheVersion: expect.any(String) });
  if (process.env.SMOKE_EXPECTED_COMMIT) expect(info.commit).toBe(process.env.SMOKE_EXPECTED_COMMIT);

  const worker = await (await request.get("sw.js")).text();
  const manifest = JSON.parse(worker.match(/^self\.PRECACHE_MANIFEST = (.+);$/m)[1]);
  expect(manifest.version).toBe(info.cacheVersion);
  expect(manifest.files.some((file) => /audition|corpus/.test(file))).toBe(false);
  // A partially uploaded deploy would fail the worker's all-or-nothing install.
  for (const file of manifest.files) {
    expect((await request.head(file)).status(), file).toBe(200);
  }
});

test("the app opens ready to practise, without errors or missing files", async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const problems = [];
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      problems.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto("./");
  await expectReady(page);
  await expect(page.getByRole("heading", { name: "Recent practice" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("a shared link opens its assignment", async ({ page }) => {
  await page.goto(`./#${MINOR_BLUES}`);
  await expect(page.getByTestId("coach-sentence")).toContainText(/^A minor blues\./);
});

test("after one visit it opens offline, and it is installable", async ({ page, context, browserName }) => {
  await page.goto("./");
  await expectReady(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });

  if (browserName === "chromium") {
    const cdp = await context.newCDPSession(page);
    expect((await cdp.send("Page.getInstallabilityErrors")).installabilityErrors).toEqual([]);
    await cdp.send("Network.clearBrowserCache");
  }

  await context.setOffline(true);
  await page.goto(`./#${MINOR_BLUES}`);
  await expect(page.getByTestId("coach-sentence")).toContainText(/^A minor blues\./);
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeEnabled({ timeout: 30_000 });
});

test("link previews and icons resolve", async ({ page, request }) => {
  await page.goto("./");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect((await request.get(image)).status()).toBe(200);
  const manifest = await (await request.get("manifest.webmanifest")).json();
  for (const icon of manifest.icons) expect((await request.head(icon.src)).status(), icon.src).toBe(200);
});

test("the musical QA audition page loads", async ({ page }) => {
  await page.goto("./audition.html");
  await expect(page.getByRole("heading", { name: "Musical QA audition" })).toBeVisible();
});
