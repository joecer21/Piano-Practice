import { expect, test } from "@playwright/test";

test("after one visit, the app and its piano work offline", async ({ page, context }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const sentence = page.getByTestId("coach-sentence");
  await expect(sentence).toContainText(/major|minor|pentatonic|blues/);
  const onlineSentence = await sentence.textContent();

  // The worker has installed (precached everything) and controls the page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();

  await expect(sentence).toHaveText(onlineSentence);
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeEnabled({ timeout: 15_000 });
  const sample = await page.evaluate(async () => {
    const response = await fetch("samples/a4vl.mp3");
    return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
  });
  expect(sample.ok).toBe(true);
  expect(sample.bytes).toBeGreaterThan(1000);
  expect(pageErrors).toEqual([]);
});
