import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expandPracticeHistory, openHistoryOptions, openSoundSettings } from "./support.js";

async function waitForPiano(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__PIANO_PRACTICE_TEST__?.sampler;
    return snapshot?.libraries?.[snapshot.activeLibraryId]?.phase === "ready";
  });
}

test("an interrupted session survives reload and returns as an explainable next step", async ({ page }) => {
  await page.goto("/");
  await waitForPiano(page);
  await expect(page.getByText(/pick up where you left off/i)).toBeVisible();

  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  await expandPracticeHistory(page);
  await expect(page.locator(".practice-history-status-incomplete")).toHaveText("Incomplete");

  await page.reload();
  await waitForPiano(page);
  await expect(page.locator(".practice-recommendation")).toContainText("Continue your last session");
  await page.locator(".practice-recommendation").getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("timer")).toBeVisible();

  await page.getByRole("button", { name: "End session" }).click();
  await expandPracticeHistory(page);
  await expect(page.locator(".practice-history-status-abandoned")).toHaveText("Ended early");
  await page.locator(".practice-history-item summary").click();
  await page.getByLabel("Short label").fill("Work on the turnaround");
  await page.getByLabel("Needs-work bars").fill("2");
  await page.getByLabel("Session notes").fill("Keep the left hand light.");
  await page.getByRole("button", { name: "Save notes" }).click();

  await page.reload();
  await expandPracticeHistory(page);
  await expect(page.getByText("Work on the turnaround")).toBeVisible();
  await expect(page.locator(".practice-recommendation")).toContainText("Focus on bar 2");
  await page.keyboard.press("Escape");
  await expect(page.locator("#coach-tool-panel")).toBeHidden();
  await page.locator(".practice-recommendation").getByRole("button", { name: "Practice" }).click();
  await expect(page.getByRole("button", { name: /^Bar 2,/ })).toHaveAttribute("aria-pressed", "true");
});

test("history can be annotated, deleted and cleared by keyboard without losing focus", async ({ page }) => {
  await page.goto("/");
  await waitForPiano(page);
  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await expandPracticeHistory(page);
  await openHistoryOptions(page);
  await page.locator(".practice-history-item summary").focus();
  await page.keyboard.press("Enter");

  await page.getByLabel("Short label").fill("Turnaround");
  await page.getByRole("button", { name: "Save notes" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".practice-history-item [role=status]")).toHaveText("Notes saved.");

  // Audit from the top: axe reports content that merely sits under the sticky
  // header at the current scroll position as obscured.
  await page.evaluate(() => window.scrollTo(0, 0));
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);

  // Deleting asks first, starts on the safe choice, and returns focus when cancelled.
  await page.getByRole("button", { name: "Delete this record" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".practice-history-item")).toContainText("Delete this record permanently?");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Delete this record" })).toBeFocused();
  await expect(page.locator(".practice-history-item")).toHaveCount(1);

  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Yes, delete" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".practice-history-item")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recent practice" })).toBeFocused();
  await expect(page.locator(".practice-history-tools [role=status]")).toHaveText("Practice record deleted.");

  // Clearing behaves the same way.
  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Clear history" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.getByRole("button", { name: "Yes, clear" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Recent practice" })).toBeFocused();
  await expect(page.locator(".practice-history-item")).toHaveCount(0);
});

test("practice saved in one tab appears in another and survives that tab's own writes", async ({
  context,
}) => {
  const first = await context.newPage();
  const second = await context.newPage();
  for (const page of [first, second]) {
    await page.goto("/");
    await waitForPiano(page);
  }

  await first.getByRole("button", { name: "Start 5 minutes" }).click();
  await first.getByRole("button", { name: "End session" }).click();
  await expect(second.locator(".practice-history-item")).toHaveCount(1);

  // The second tab changes something unrelated; the first tab's record must survive it.
  await openSoundSettings(second);
  await second.locator("#tempo-slider").fill("104");
  await first.reload();
  await waitForPiano(first);
  await expect(first.locator(".practice-history-item")).toHaveCount(1);
});
