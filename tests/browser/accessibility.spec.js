import { expect, test } from "@playwright/test";
import { openAssignmentDrawer, openKeyboardOptions } from "./support.js";

test("Live Piano exposes accessible controls and a phone-friendly range", async ({ page }, testInfo) => {
  await page.goto("/");

  const piano = page.locator("#piano-visual");
  const keys = piano.locator(".piano-key");
  const isMobile = testInfo.project.name === "mobile";
  await expect(keys).toHaveCount(isMobile ? 25 : 53);
  await expect(piano).toHaveAttribute("role", "group");
  await expect(page.locator("#status-line")).toHaveAttribute("aria-live", "polite");

  const tabStops = piano.locator('.piano-key[tabindex="0"]');
  await expect(tabStops).toHaveCount(1);
  await expect(tabStops).toHaveAttribute("data-note", "C4");
  await tabStops.focus();
  await page.keyboard.press("ArrowRight");
  const cSharp = piano.locator('[data-note="C#4"]');
  await expect(cSharp).toBeFocused();

  await page.waitForFunction(() => {
    const snapshot = window.__samplerSnapshot;
    return snapshot?.libraries?.[snapshot.activeLibraryId]?.phase === "ready";
  });
  // What the player presses is mirrored as a ring (data-played), not painted in a
  // hand colour, which is reserved for the assignment sounding.
  await page.keyboard.down("Space");
  await expect(cSharp).toHaveAttribute("data-played", "held");
  await page.keyboard.up("Space");
  await expect(cSharp).not.toHaveAttribute("data-played");

  await page.getByLabel("Computer keys").check();
  await page.evaluate(() => document.activeElement?.blur());
  const middleC = piano.locator('[data-note="C4"]');
  await page.keyboard.down("a");
  await expect(middleC).toHaveAttribute("data-played", "held");
  await page.keyboard.up("a");
  await expect(middleC).not.toHaveAttribute("data-played");

  await openAssignmentDrawer(page);
  await page.locator("#preset-select").focus();
  await page.keyboard.down("s");
  await expect(piano.locator('[data-note="D4"]')).not.toHaveAttribute("data-played");
  await page.keyboard.up("s");

  const controlsToggle = page.locator("#advanced-controls-toggle");
  await expect(controlsToggle).toHaveAttribute("aria-expanded", "false");
  await controlsToggle.click();
  await expect(controlsToggle).toHaveAttribute("aria-expanded", "true");

  await openKeyboardOptions(page);
  await expect(page.getByLabel("Gliss / play")).toBeVisible();
  await expect(page.getByLabel("Computer keys")).toBeVisible();
  await expect(piano).toHaveCSS("touch-action", "auto");
  await page.getByLabel("Gliss / play").check();
  await expect(piano).toHaveCSS("touch-action", "none");

  if (isMobile) {
    const minimumKeyWidth = await keys.evaluateAll((elements) =>
      Math.min(...elements.map((element) => element.getBoundingClientRect().width)),
    );
    expect(minimumKeyWidth).toBeGreaterThanOrEqual(44);

    const wrapper = page.locator(".piano-visual-wrapper");
    const scrollState = await wrapper.evaluate((element) => {
      element.scrollLeft = 100;
      return {
        canScroll: element.scrollWidth > element.clientWidth,
        scrollLeft: element.scrollLeft,
      };
    });
    expect(scrollState.canScroll).toBe(true);
    expect(scrollState.scrollLeft).toBeGreaterThan(0);
  }
});
