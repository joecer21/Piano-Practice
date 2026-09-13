import { expect, test } from "@playwright/test";

async function waitForPiano(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__PIANO_PRACTICE_TEST__?.sampler;
    return snapshot?.libraries?.[snapshot.activeLibraryId]?.phase === "ready";
  });
}

test("an interrupted session survives reload and returns as an explainable next step", async ({ page }) => {
  await page.goto("/");
  await waitForPiano(page);
  await expect(page.getByText(/records stay on this device/i)).toBeVisible();

  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  await expect(page.locator(".practice-history-status-incomplete")).toHaveText("Incomplete");

  await page.reload();
  await waitForPiano(page);
  await expect(page.locator(".practice-recommendation")).toContainText("Continue your last session");
  await page.locator(".practice-recommendation").getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("timer")).toBeVisible();

  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.locator(".practice-history-status-abandoned")).toHaveText("Ended early");
  await page.locator(".practice-history-item summary").click();
  await page.getByLabel("Short label").fill("Work on the turnaround");
  await page.getByLabel("Needs-work bars").fill("2");
  await page.getByLabel("Session notes").fill("Keep the left hand light.");
  await page.getByRole("button", { name: "Save notes" }).click();

  await page.reload();
  await expect(page.getByText("Work on the turnaround")).toBeVisible();
  await expect(page.locator(".practice-recommendation")).toContainText("Focus on bar 2");
  await page.locator(".practice-recommendation").getByRole("button", { name: "Practice" }).click();
  await expect(page.getByRole("button", { name: /^Bar 2,/ })).toHaveAttribute("aria-pressed", "true");
});
