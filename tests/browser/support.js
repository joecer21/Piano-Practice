/**
 * The React assignment workspace is a disclosure above the practice surface.
 * Open it by its visible summary so tests exercise the real path.
 */
export async function openAssignmentDrawer(page) {
  await openTool(page, "assignment");
  await waitForOpenDetails(page, "#assignment-workspace");
}

export async function openSoundSettings(page) {
  await openTool(page, "sound");
  await waitForOpenDetails(page, "#settings-drawer");
}

export async function openScaleReference(page) {
  await openTool(page, "reference");
  await waitForOpenDetails(page, "#scale-reference");
}

export async function openMidiInput(page) {
  await openTool(page, "input");
}

export async function openLibraryTools(page) {
  await openTool(page, "library");
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

async function openTool(page, tool) {
  const panel = page.locator("#coach-tool-panel");
  if (!(await panel.isVisible()) || (await panel.locator(`[data-tool="${tool}"]`).isHidden())) {
    // By trigger, not visible label: the MIDI tool names the connected keyboard, and
    // narrow screens show icons only.
    await page.locator(`.coach-tool-rail [data-tool-trigger="${tool}"]`).click();
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

// Real MIDI hardware cannot run in CI. These tests replace navigator.requestMIDIAccess
// before the app loads with a fake a test can plug devices into and play.
export async function installFakeMidi(page, { deny = false } = {}) {
  await page.addInitScript(
    ({ deny }) => {
      const inputs = new Map();
      const access = { inputs: { forEach: (callback) => inputs.forEach(callback) }, onstatechange: null };
      window.__fakeMidi = {
        requested: 0,
        plug(id, name) {
          inputs.set(id, { id, name, manufacturer: "", state: "connected", onmidimessage: null });
          access.onstatechange?.({ port: { type: "input" } });
        },
        unplug(id) {
          inputs.get(id).state = "disconnected";
          access.onstatechange?.({ port: { type: "input" } });
        },
        send(id, bytes) {
          inputs.get(id)?.onmidimessage?.({ data: Uint8Array.from(bytes) });
        },
      };
      Object.defineProperty(Navigator.prototype, "requestMIDIAccess", {
        configurable: true,
        value: async () => {
          window.__fakeMidi.requested += 1;
          if (deny) throw new DOMException("denied", "NotAllowedError");
          return access;
        },
      });
    },
    { deny },
  );
}

export async function waitForPiano(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__PIANO_PRACTICE_TEST__?.sampler;
    return snapshot?.libraries?.[snapshot.activeLibraryId]?.phase === "ready";
  });
}
