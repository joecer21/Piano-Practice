import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the musical QA page auditions sequentially and records an exportable disposition", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/audition.html");

  await expect(page.getByRole("heading", { name: "Musical QA audition" })).toBeVisible();
  await expect(page.getByLabel("Review progress")).toContainText("1 / 27");
  await expect(page.getByRole("heading", { name: "First Pop Improv in C" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Listen for" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Structural signals" })).toBeVisible();

  const play = page.getByRole("button", { name: "Play case" });
  await expect(play).toBeEnabled({ timeout: 20_000 });
  await play.click();
  await expect(page.getByRole("button", { name: "Playing…" })).toBeDisabled();
  await page.getByRole("button", { name: "Stop" }).click();

  await page.getByLabel("Reviewer", { exact: true }).fill("Browser QA");
  await page.getByLabel("Reviewer notes").fill("Harmony, register, repetition and learner fit reviewed.");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".disposition")).toHaveText("approved");
  await expect(page.getByLabel("Review progress")).toContainText("1 approved");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("musical-review.json");

  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByLabel("Review progress")).toContainText("2 / 27");
  await page.reload();
  await expect(page.getByLabel("Review progress")).toContainText("1 approved");

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(errors, `uncaught page errors: ${errors.join("; ")}`).toEqual([]);
});
