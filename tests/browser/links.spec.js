import { expect, test } from "@playwright/test";
import { openAssignmentDrawer, openSoundSettings } from "./support.js";

const MINOR_BLUES =
  "v=1&key=A&mode=minorBlues&prog=blues-12-minor&style=jazz&lh=root-5th-oct&motif=blues-riff-minor&len=12&seed=shared-link&preset=blues-a";

test("a shared link opens its assignment, and the address bar stays a share link", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/#${MINOR_BLUES}`);

  const sentence = page.getByTestId("coach-sentence");
  await expect(sentence).toContainText(/^A minor blues\./);
  await expect(sentence).toContainText("♭5");
  expect(new URL(page.url()).hash).toBe(`#${MINOR_BLUES}`);

  // Rerolling commits a new assignment; the URL follows it without adding history.
  const historyLength = await page.evaluate(() => window.history.length);
  await openAssignmentDrawer(page);
  await page.locator("#assignment-reroll").click();
  await expect.poll(() => new URL(page.url()).hash).not.toBe(`#${MINOR_BLUES}`);
  const rerolled = new URL(page.url()).hash;
  expect(rerolled).toMatch(/^#v=1&key=/);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  // And that new URL, opened fresh, is the same assignment.
  const rerolledSentence = await sentence.textContent();
  await page.goto(`/${rerolled}`);
  await page.reload();
  await expect(sentence).toHaveText(rerolledSentence);
  expect(pageErrors).toEqual([]);
});

test("a reload comes back to the last assignment and tempo", async ({ page }) => {
  await page.goto(`/#${MINOR_BLUES}`);
  const sentence = page.getByTestId("coach-sentence");
  await expect(sentence).toContainText(/^A minor blues\./);
  await openSoundSettings(page);
  await page.locator("#tempo-slider").fill("112");

  // No fragment this time: the library, not the URL, restores it.
  await page.goto("/");
  await expect(sentence).toContainText(/^A minor blues\./);
  await expect(page.locator("#tempo-slider")).toHaveValue("112");
});

test("a starred assignment survives a reload and reopens from the list", async ({ page }) => {
  await page.goto(`/#${MINOR_BLUES}`);
  const sentence = page.getByTestId("coach-sentence");
  await expect(sentence).toContainText(/^A minor blues\./);
  const starredSentence = await sentence.textContent();

  await page.getByRole("button", { name: "☆ Star" }).click();
  await expect(page.getByRole("button", { name: "★ Starred" })).toHaveAttribute("aria-pressed", "true");

  // Move on to something else, then come back tomorrow.
  await openAssignmentDrawer(page);
  await page.locator("#assignment-reroll").click();
  await expect(sentence).not.toHaveText(starredSentence);
  await expect(page.getByRole("button", { name: "☆ Star" })).toBeVisible();
  await page.goto("/");

  await page.getByText("Starred (1)").click();
  const list = page.getByRole("list", { name: "Starred assignments" });
  await expect(list).toContainText("A minor blues · 12-Bar Minor Blues · Blues Riff - minor blues ♭5");
  await list.getByRole("button", { name: /^Open A minor blues/ }).click();
  await expect(sentence).toHaveText(starredSentence);
  await expect(page.getByRole("button", { name: "★ Starred" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(`#${MINOR_BLUES}`);
});

test("a broken or unsafe link is explained, and the app still opens", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(
    "/#v=1&key=C&mode=majorBlues&prog=pop-4&style=pop&lh=pop-8ths&motif=funk-sync&len=8&seed=x",
  );

  await expect(page.locator("#status-line")).toContainText("That link couldn't be opened");
  await expect(page.locator("#status-line")).toContainText("isn't offered in Major Blues");
  await expect(page.getByTestId("coach-sentence")).toContainText(/^C major\./);
  expect(pageErrors).toEqual([]);
});
