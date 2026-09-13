import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openAssignmentDrawer, openScaleReference, openSoundSettings } from "./support.js";

test("studio is the default; paper is remembered, applied before paint, and meets WCAG AA", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "studio");

  await page.getByRole("button", { name: "Switch to paper theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "paper");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f6f1eb");

  // The stored choice is applied by the inline script, before any module runs.
  await page.route(/\.js$/, (route) => route.abort());
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "paper");
  await page.unroute(/\.js$/);
  await page.reload();
  await expect(page.getByTestId("coach-sentence")).toBeVisible();

  await openAssignmentDrawer(page);
  await openScaleReference(page);
  await openSoundSettings(page);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(violations).toEqual([]);

  await page.getByRole("button", { name: "Switch to studio theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "studio");
});
