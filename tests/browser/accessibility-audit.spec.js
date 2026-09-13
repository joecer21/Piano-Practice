import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openAssignmentDrawer, openScaleReference, openSoundSettings } from "./support.js";

const auditedStandards = ["wcag2a", "wcag2aa", "wcag21aa"];

async function audit(page) {
  return new AxeBuilder({ page }).withTags(auditedStandards).analyze();
}

test("the landing and expanded practice controls have no detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("coach-sentence")).toBeVisible();

  expect((await audit(page)).violations).toEqual([]);

  await openAssignmentDrawer(page);
  await openScaleReference(page);
  await openSoundSettings(page);
  await page.getByText("Mix and feel").click();

  expect((await audit(page)).violations).toEqual([]);
});
