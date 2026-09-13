import { expect, test } from "@playwright/test";
import { openAssignmentDrawer } from "./support.js";

// Each test here pins a defect that reached a user, so a regression is caught as
// the behaviour the user would see rather than as an internal invariant.

test("B2: an empty custom progression does not kill the app", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  // The hint is a transient message with a ~4.2s lifetime, so polling for it
  // races the clock under parallel load. Record every value the status line
  // takes instead, which makes the assertion independent of when we look.
  await page.evaluate(() => {
    const node = document.getElementById("status-line");
    window.__statusLog = [];
    const record = () => {
      const text = node.textContent.trim();
      if (text && window.__statusLog.at(-1) !== text) window.__statusLog.push(text);
    };
    record();
    new MutationObserver(record).observe(node, { childList: true, characterData: true, subtree: true });
  });

  await openAssignmentDrawer(page);

  // Select the custom palette without adding any chord, then change the key.
  // This is now an explicitly supported draft: it cannot replace the last valid
  // assignment until its first chord has been added.
  await page.locator("#progression-select").selectOption("custom");
  await page.locator("#key-select").selectOption("G");

  expect(pageErrors, `uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);

  // The last valid assignment is preserved rather than blanked.
  await expect(page.locator("#scale-name")).not.toHaveText("--");
  await expect(page.getByRole("alert")).toContainText("Add at least one chord");

  // And the app is still live: adding a chord recovers.
  await page.locator(".assignment-palette-group button").first().click();
  await page.getByRole("button", { name: "Apply assignment" }).click();
  await expect
    .poll(async () => (await page.evaluate(() => window.__statusLog)).join(" | "))
    .toContain("Assignment updated");
  expect(pageErrors).toEqual([]);
});

test("B1: sample loading reports progress and reaches ready", async ({ page }) => {
  await page.goto("/");

  const status = page.locator("#sampler-status");
  await expect(status).toBeAttached();

  // The element did not exist, so every row below rendered into null.
  await expect
    .poll(async () => status.locator(".sampler-row").count(), { timeout: 60_000 })
    .toBeGreaterThan(0);

  await expect.poll(async () => (await status.textContent()) || "", { timeout: 60_000 }).toContain("Ready");
});

test("B11: no debug logging on the console", async ({ page }) => {
  const noisy = [];
  // Tone.js prints its own version banner on import; that is third-party and
  // not something this codebase controls.
  const THIRD_PARTY = /Tone.js v/;
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "log" && !THIRD_PARTY.test(text)) noisy.push(text);
  });

  await page.goto("/");
  await expect(page.locator("#scale-name")).not.toHaveText("--");
  await page.waitForTimeout(1500); // let sampler progress ticks fire

  expect(noisy, `unexpected console.log output: ${noisy.join(" | ")}`).toEqual([]);
});
