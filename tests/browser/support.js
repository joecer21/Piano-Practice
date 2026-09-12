/**
 * The pre-coach controls live in a disclosure below the practice surface. Open it
 * the way a user would, by its visible summary, so tests exercise the real path.
 */
export async function openAssignmentDrawer(page) {
  const drawer = page.locator("#legacy-drawer");
  if (!(await drawer.evaluate((element) => element.open))) {
    await page.getByText("Change the assignment, sound and more").click();
  }
}

export async function openKeyboardOptions(page) {
  const options = page.locator(".coach-more");
  if (!(await options.evaluate((element) => element.open))) {
    await page.getByText("Keyboard options").click();
  }
}
