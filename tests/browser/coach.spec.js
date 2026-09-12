import { expect, test } from "@playwright/test";

async function waitForPiano(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__samplerSnapshot;
    return snapshot?.libraries?.[snapshot.activeLibraryId]?.phase === "ready";
  });
}

test("land, start five minutes, then loop bar 3 with the left hand at half speed", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const sentence = page.getByTestId("coach-sentence");
  await expect(sentence).toContainText(/major|minor|pentatonic|blues/);
  await expect(sentence).toContainText("underneath");

  await waitForPiano(page);
  const start = page.getByRole("button", { name: "Start 5 minutes" });
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page.getByRole("timer")).toHaveText(/^[45]:\d\d$/);
  await expect
    .poll(() => page.evaluate(() => window.__coachPlayback))
    .toMatchObject({
      parts: ["lh", "rh"],
      countIn: true,
      loop: true,
      rate: 1,
    });
  await expect(page.locator(".coach-count-in")).toHaveText(/Count-in [1-4]/);

  await page.getByRole("button", { name: /^Bar 3,/ }).click();
  await page.getByRole("button", { name: "Left hand" }).click();
  await page.getByRole("button", { name: "Half speed" }).click();

  await expect
    .poll(() => page.evaluate(() => window.__coachPlayback))
    .toMatchObject({
      parts: ["lh"],
      barRange: [2, 2],
      rate: 0.5,
      loop: true,
    });

  // The playhead is drawn inside bar 3 of the timeline once playback is running.
  const playhead = page.locator(".coach-timeline-playhead");
  await expect(playhead).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => {
      const [roll, head] = await Promise.all([
        page.locator(".coach-timeline-roll").boundingBox(),
        playhead.boundingBox(),
      ]);
      const bars = await page.locator(".coach-timeline-bar").count();
      const barWidth = roll.width / bars;
      return Math.floor((head.x - roll.x) / barWidth);
    })
    .toBe(2);

  // The keyboard teaches bar 3: exactly one pitch class is marked as root.
  const rootNotes = await page
    .locator('#piano-visual .piano-key[data-role="root"]')
    .evaluateAll((keys) => [...new Set(keys.map((key) => key.dataset.note.replace(/-?\d+$/, "")))]);
  expect(rootNotes).toHaveLength(1);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(pageErrors).toEqual([]);
});

test("hue is reserved for the hand: role marks never borrow a hand colour", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('#piano-visual .piano-key[data-role="root"]').first()).toBeAttached();

  const audit = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const toRgb = (value) => {
      const probe = document.createElement("span");
      probe.style.color = value.trim();
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
    const hands = new Set([
      toRgb(root.getPropertyValue("--hand-lh")),
      toRgb(root.getPropertyValue("--hand-rh")),
    ]);

    const markColors = [
      ...document.querySelectorAll("#piano-visual .piano-key:not(.active) .key-label"),
    ].flatMap((label) => {
      const style = getComputedStyle(label);
      return [style.color, style.backgroundColor, style.borderColor];
    });
    const lhNote = document.querySelector(".coach-timeline-lane.hand-lh .coach-timeline-note");
    const rhNote = document.querySelector(".coach-timeline-lane.hand-rh .coach-timeline-note");
    const chrome = [...document.querySelectorAll(".coach-shell button")].flatMap((button) => {
      const style = getComputedStyle(button);
      return [style.color, style.backgroundColor];
    });

    return {
      markUsesHandHue: markColors.some((color) => hands.has(color)),
      chromeUsesHandHue: chrome.some((color) => hands.has(color)),
      lhNoteIsLhHue: lhNote ? getComputedStyle(lhNote).fill === [...hands][0] : null,
      rhNoteIsRhHue: rhNote ? getComputedStyle(rhNote).fill === [...hands][1] : null,
      markCount: markColors.length,
    };
  });

  expect(audit.markCount).toBeGreaterThan(0);
  expect(audit.markUsesHandHue).toBe(false);
  expect(audit.chromeUsesHandHue).toBe(false);
  expect(audit.lhNoteIsLhHue).toBe(true);
  if (audit.rhNoteIsRhHue !== null) expect(audit.rhNoteIsRhHue).toBe(true);
});

test("coach controls meet touch targets and the page never scrolls sideways", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeVisible();

  const undersized = await page
    .locator(
      ".coach-session button, .coach-transport button, .coach-timeline-bar, .coach-link, .coach-more > summary",
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => ({
          name: element.textContent.trim(),
          height: element.getBoundingClientRect().height,
        }))
        .filter((entry) => entry.height < 44),
    );
  expect(undersized).toEqual([]);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
