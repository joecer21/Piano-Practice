/**
 * The React assignment workspace is a disclosure above the practice surface.
 * Open it by its visible summary so tests exercise the real path.
 */
export async function openAssignmentDrawer(page) {
  await openTool(page, "Change assignment", "assignment");
  await waitForOpenDetails(page, "#assignment-workspace");
}

export async function openSoundSettings(page) {
  await openTool(page, "Sound", "sound");
  await waitForOpenDetails(page, "#settings-drawer");
}

export async function openScaleReference(page) {
  await openTool(page, "Scale & shape", "reference");
  await waitForOpenDetails(page, "#scale-reference");
}

export async function openMidiInput(page) {
  await openTool(page, "MIDI & input", "input");
}

export async function openLibraryTools(page) {
  await openTool(page, "Star & share", "library");
}

export async function expandPracticeHistory(page) {
  const toggle = page.getByRole("button", { name: "Full history", exact: true });
  if (await toggle.isVisible()) await toggle.click();
}

export async function openHistoryOptions(page) {
  await expandPracticeHistory(page);
  const options = page.locator(".practice-history-overflow");
  if (!(await options.evaluate((element) => element.open))) await options.locator("summary").click();
}

async function openTool(page, name, tool) {
  const panel = page.locator("#coach-tool-panel");
  if (!(await panel.isVisible()) || (await panel.locator(`[data-tool="${tool}"]`).isHidden())) {
    await page.locator(".coach-tool-rail").getByRole("button", { name, exact: true }).click();
  }
  await panel.locator(`[data-tool="${tool}"]`).waitFor({ state: "visible" });
}

async function waitForOpenDetails(page, selector) {
  await page.waitForFunction((value) => document.querySelector(value)?.open === true, selector);
}

export async function openKeyboardOptions(page) {
  const options = page.locator(".coach-more");
  if (!(await options.evaluate((element) => element.open))) {
    await page.getByText("Keyboard options").click();
  }
}
