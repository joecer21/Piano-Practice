import { expect, test } from "@playwright/test";
import { openAssignmentDrawer } from "./support.js";

test("loads, generates, plays, stops, and switches piano models", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "5-Minute Improv Coach" })).toBeVisible();
  await openAssignmentDrawer(page);
  await expect(page.locator("#scale-name")).not.toHaveText("--");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  await expect
    .poll(() =>
      page.locator("#progression-visual").evaluate((timeline) => ({
        overflowX: getComputedStyle(timeline).overflowX,
        pageFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      })),
    )
    .toEqual({ overflowX: "auto", pageFitsViewport: true });

  await page.getByRole("button", { name: "Show Controls" }).click();
  await page.getByRole("button", { name: "Generate Assignment" }).click();
  await expect(page.locator("#status-line")).toContainText("Assignment updated");

  const initialKey = await page.locator("#key-select").inputValue();
  const initialSeed = await page.locator("#assignment-seed").textContent();
  await page.getByRole("button", { name: "Lock key" }).click();
  await page.getByRole("button", { name: "Reroll unlocked" }).click();
  await expect(page.locator("#key-select")).toHaveValue(initialKey);
  await expect(page.locator("#assignment-seed")).not.toHaveText(initialSeed || "");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#assignment-seed")).toHaveText(initialSeed || "");
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator("#assignment-seed")).not.toHaveText(initialSeed || "");

  await page.waitForFunction(() => {
    const snapshot = window.__samplerSnapshot;
    return snapshot?.libraries?.[snapshot.activeLibraryId]?.phase === "ready";
  });

  const livePiano = page.locator("#piano-visual");
  await expect(page.getByRole("heading", { name: "Keyboard", exact: true })).toBeVisible();
  await expect(livePiano.locator(".piano-key")).toHaveCount(testInfo.project.name === "mobile" ? 25 : 53);
  const middleC = livePiano.locator('[data-note="C4"]');
  await middleC.scrollIntoViewIfNeeded();
  await middleC.hover();
  await page.mouse.down();
  await expect(middleC).toHaveAttribute("data-played", "held");
  // A press is the player, not the right hand of the assignment: no hand hue.
  const pressedClasses = await middleC.evaluate((element) => [...element.classList]);
  expect(pressedClasses.filter((name) => ["active", "lh", "rh"].includes(name))).toEqual([]);
  await page.mouse.up();
  await expect(middleC).not.toHaveAttribute("data-played");

  await page.getByRole("button", { name: "Play All" }).click();
  await expect.poll(() => page.evaluate(() => window.__transportState)).toBe("started");
  await expect.poll(() => livePiano.locator(".piano-key.active.lh").count()).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Stop All" }).click();
  await expect.poll(() => page.evaluate(() => window.__transportState)).toBe("stopped");
  await expect(livePiano.locator(".piano-key.active")).toHaveCount(0);

  await page.locator("#piano-model").selectOption("local-bright");
  await expect
    .poll(() => page.evaluate(() => window.__samplerSnapshot?.activeLibraryId), {
      timeout: 60_000,
    })
    .toBe("local-bright");
  await expect(page.locator("#status-line")).toContainText("active");
});
