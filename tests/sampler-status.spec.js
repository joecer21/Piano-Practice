import { JSDOM } from "jsdom";
import { renderSamplerStatus } from "../ui.js";
import { afterEach, describe, it } from "vitest";
import { expect } from "vitest";

afterEach(() => {
  delete global.document;
  delete global.window;
});

function createSelectorDom() {
  const dom = new JSDOM(`<!doctype html><body>
    <select id="piano-model"></select>
  </body>`);
  global.document = dom.window.document;
  global.window = dom.window;
  return {
    dom,
    pianoSelect: dom.window.document.getElementById("piano-model"),
  };
}

function snapshotWith(overrides = {}) {
  const base = {
    activeLibraryId: "local-soft",
    libraries: {
      "fuhton-piano": {
        libraryId: "fuhton-piano",
        label: "Fuhton Piano",
        isDefault: false,
        phase: "ready",
        progress: 1,
        active: true,
      },
      "local-soft": {
        libraryId: "local-soft",
        label: "Piano Lite - Soft",
        isDefault: true,
        phase: "standby",
        progress: 0,
        active: false,
      },
      "salamander-lite": {
        libraryId: "salamander-lite",
        label: "Salamander Lite",
        isDefault: false,
        phase: "standby",
        progress: 0,
        active: false,
      },
    },
  };
  return {
    ...base,
    ...overrides,
    libraries: {
      ...base.libraries,
      ...(overrides.libraries || {}),
    },
  };
}

function run() {
  describe("Piano model selector sync", () => {
    it("disables the selector until models are available", () => {
      const { pianoSelect } = createSelectorDom();
      const uiDom = { pianoModel: pianoSelect };
      renderSamplerStatus(uiDom, { libraries: {} });
      expect(pianoSelect.disabled, "Selector should disable while loading").toBe(true);
      expect(pianoSelect.options[0].textContent, "Placeholder label missing").toMatch(/Loading models/);
    });

    it("populates models with the default first", () => {
      const { pianoSelect } = createSelectorDom();
      const uiDom = { pianoModel: pianoSelect };
      const snapshot = snapshotWith();
      renderSamplerStatus(uiDom, snapshot);
      expect(pianoSelect.options.length, "Expected three piano models").toBe(3);
      expect(pianoSelect.options[0].textContent, "Bundled soft piano should be first option").toMatch(
        /Piano Lite - Soft/,
      );
      expect(pianoSelect.options[0].textContent, "Default label missing").toMatch(/Default/);
      expect(pianoSelect.value, "Selector should default to the bundled soft piano").toBe("local-soft");
    });

    it("tracks the active library when switching", () => {
      const { pianoSelect } = createSelectorDom();
      const uiDom = { pianoModel: pianoSelect };
      const snapshot = snapshotWith({
        activeLibraryId: "salamander-lite",
        libraries: {
          "salamander-lite": {
            libraryId: "salamander-lite",
            label: "Salamander Lite",
            isDefault: false,
            phase: "ready",
            progress: 1,
            active: true,
          },
        },
      });
      renderSamplerStatus(uiDom, snapshot);
      expect(pianoSelect.value, "Selector should reflect the active library").toBe("salamander-lite");
    });
  });
}

run();
