import { expect, test } from "@playwright/test";
import { installFakeMidi, openMidiInput, waitForPiano } from "./support.js";

const playback = (page) => page.evaluate(() => window.__PIANO_PRACTICE_TEST__?.playback);
const samplerReady = (page) =>
  page.evaluate(() => {
    const snapshot = window.__PIANO_PRACTICE_TEST__?.sampler;
    return snapshot?.libraries?.[snapshot.activeLibraryId]?.phase === "ready";
  });

test("focus mode hides app chrome but keeps the instrument, a held note and every practice control", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installFakeMidi(page);
  await page.goto("/");
  await waitForPiano(page);

  await openMidiInput(page);
  await page.evaluate(() => window.__fakeMidi.plug("piano", "Stage Piano"));
  await page.getByRole("button", { name: "Connect MIDI keyboard" }).click();
  await expect(page.getByText("Mirroring Stage Piano")).toBeVisible();
  await page.keyboard.press("Escape");

  const shell = page.locator(".coach-shell");
  const held = page.locator('#piano-visual [data-note="C4"]');
  await page.evaluate(() => window.__fakeMidi.send("piano", [0x90, 60, 100]));
  await expect(held).toHaveAttribute("data-played", "held");
  await expect(shell).toHaveAttribute("data-session-status", "idle");

  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  await expect(shell).toHaveAttribute("data-session-status", "running");
  await expect(page.getByRole("timer")).toBeVisible();

  // App chrome steps aside.
  await expect(page.locator(".coach-tool-rail")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Recent practice" })).toBeHidden();
  await expect(page.getByTestId("coach-feel")).toBeHidden();
  await expect(page.getByText("Keyboard options")).toBeHidden();

  // The instrument never remounts: the sampler stays loaded and the held key stays lit.
  expect(await samplerReady(page)).toBe(true);
  await expect(held).toHaveAttribute("data-played", "held");
  await expect(page.locator("#piano-visual-card #coach-timeline-slot .coach-timeline")).toBeVisible();

  // Views, bar looping, hands and speed all still work while chrome is hidden.
  await page.getByRole("button", { name: "Hands apart" }).click();
  await page.getByRole("button", { name: /^Bar 3,/ }).click();
  await page.getByRole("button", { name: "Left hand" }).click();
  await page.getByRole("button", { name: "Half speed" }).click();
  await expect
    .poll(() => playback(page))
    .toMatchObject({ parts: ["lh"], barRange: [2, 2], rate: 0.5, loop: true });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(shell).toHaveAttribute("data-session-status", "paused");
  await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
  await expect(page.locator(".coach-tool-rail")).toBeHidden();
  expect(await samplerReady(page)).toBe(true);
  await expect(held).toHaveAttribute("data-played", "held");

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(shell).toHaveAttribute("data-session-status", "running");

  await page.getByRole("button", { name: "End session" }).click();
  await expect(shell).toHaveAttribute("data-session-status", "idle");
  await expect(page.locator(".coach-tool-rail")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent practice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeFocused();
  await expect(held).toHaveAttribute("data-played", "held");
  expect(pageErrors).toEqual([]);
});

test("the summary card takes focus, saves a note to Recent practice and returns to the Stage", async ({
  page,
}) => {
  await page.goto("/");
  await waitForPiano(page);

  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  for (let step = 0; step < 5; step += 1) await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  const title = page.getByRole("heading", { name: /^Five minutes, / });
  await expect(title).toBeFocused();
  await expect(page.locator(".coach-tool-rail")).toBeVisible();

  await page.getByLabel("Notes for next time").fill("Bar 3 wants a lighter left hand.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.locator(".coach-summary-note [role=status]")).toHaveText(
    "Notes saved to Recent practice.",
  );

  await page.getByRole("button", { name: "Back to the stage" }).click();
  await expect(page.getByRole("button", { name: "Start 5 minutes" })).toBeFocused();

  // The note is on the completed record, and survives a reload.
  await page.reload();
  await page.getByRole("button", { name: "Full history", exact: true }).click();
  await page.locator(".practice-history-item summary").click();
  await expect(page.getByLabel("Session notes")).toHaveValue("Bar 3 wants a lighter left hand.");
  await expect(page.locator(".practice-history-status-completed")).toHaveText("Completed");
});

test("the focus layout fits a phone without sideways scroll or undersized controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await waitForPiano(page);
  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  await expect(page.getByRole("timer")).toBeVisible();

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    undersized: [...document.querySelectorAll(".coach-session-controls button, .coach-transport button")]
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => element.getBoundingClientRect().height < 44)
      .map((element) => element.textContent),
  }));
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.undersized).toEqual([]);
});

test("keyboard focus stays clear of the sticky header in focus mode", async ({ page }) => {
  await page.goto("/");
  await waitForPiano(page);
  await page.getByRole("button", { name: "Start 5 minutes" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.locator("#status-line").evaluate((element) => {
    element.tabIndex = -1;
    element.focus();
  });

  const obscured = [];
  for (let step = 0; step < 60; step += 1) {
    await page.keyboard.press("Shift+Tab");
    const result = await page.evaluate(() => {
      const focused = document.activeElement;
      const header = document.querySelector(".coach-top");
      if (!focused || focused === document.body || header.contains(focused)) return { skip: true };
      const box = focused.getBoundingClientRect();
      return {
        skip: false,
        label: (focused.textContent || focused.getAttribute("aria-label") || "").trim().slice(0, 30),
        hidden: box.height > 0 && box.bottom <= header.getBoundingClientRect().bottom + 1,
        top: window.scrollY,
      };
    });
    if (!result.skip && result.hidden) obscured.push(result.label);
    if (!result.skip && result.top === 0) break;
  }
  expect(obscured).toEqual([]);
});
