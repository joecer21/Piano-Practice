/**
 * The React assignment workspace is a disclosure above the practice surface.
 * Open it by its visible summary so tests exercise the real path.
 */
export async function openAssignmentDrawer(page) {
  const drawer = page.locator("#assignment-workspace");
  if (!(await drawer.evaluate((element) => element.open))) {
    await drawer.locator("summary").click();
  }
}

export async function openSoundSettings(page) {
  const drawer = page.locator("#settings-drawer");
  if (!(await drawer.evaluate((element) => element.open))) {
    await page.getByText("Sound and playback settings").click();
  }
}

export async function openKeyboardOptions(page) {
  const options = page.locator(".coach-more");
  if (!(await options.evaluate((element) => element.open))) {
    await page.getByText("Keyboard options").click();
  }
}
