import { expect, test } from "@playwright/test";
import { expandPracticeHistory, openAssignmentDrawer } from "./support.js";

test("the Stage keeps one history section and portals the timeline into the keyboard hero", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("#piano-visual-card #coach-timeline-slot .coach-timeline")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent practice" })).toHaveCount(1);
  await expect(page.locator("#practice-history-details")).toBeHidden();
  await expandPracticeHistory(page);
  await expect(page.locator("#coach-tool-panel #practice-history-details")).toBeVisible();
});

test("the modeless tool surface opens its requested disclosure and returns focus on Escape", async ({
  page,
}) => {
  await page.goto("/");
  await openAssignmentDrawer(page);

  const panel = page.locator("#coach-tool-panel");
  const trigger = page.locator(".coach-tool-rail").getByRole("button", { name: "Change assignment" });
  await expect(panel).toBeVisible();
  await expect(page.locator("#assignment-workspace")).toHaveAttribute("open", "");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the narrow tool surface is a bottom sheet capped at 70vh that leaves the piano visible", async ({
  page,
}) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await openAssignmentDrawer(page);

    const geometry = await page.locator("#coach-tool-panel").evaluate((element) => {
      const box = element.getBoundingClientRect();
      const piano = document.querySelector("#piano-visual-card")?.getBoundingClientRect();
      return {
        bottomGap: window.innerHeight - box.bottom,
        height: box.height,
        viewportHeight: window.innerHeight,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        visiblePianoHeight: piano ? Math.max(0, Math.min(piano.bottom, box.top) - Math.max(piano.top, 0)) : 0,
      };
    });
    expect(Math.abs(geometry.bottomGap)).toBeLessThanOrEqual(1);
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight * 0.7 + 1);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
    expect(geometry.visiblePianoHeight).toBeGreaterThan(44);
  }
});

test("the tablet landscape tool surface is a modeless right overlay", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await openAssignmentDrawer(page);

  const geometry = await page.locator("#coach-tool-panel").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element.parentElement).position,
      rightGap: window.innerWidth - box.right,
      bottomGap: window.innerHeight - box.bottom,
      width: box.width,
      viewportWidth: window.innerWidth,
    };
  });
  expect(geometry.position).toBe("fixed");
  expect(Math.abs(geometry.rightGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.bottomGap)).toBeLessThanOrEqual(1);
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth * 0.46 + 1);
});
