import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheDom, renderSamplerStatus, setAdvancedControlsCollapsed, setMixCardCollapsed } from "../ui.js";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

// Slots intentionally empty at cache time: both are created later by their renderer.
const CREATED_AT_RENDER_TIME = new Set(["motifPlayhead", "pianoRollPlayhead"]);

let dom;
beforeEach(() => {
  dom = new JSDOM(html);
  global.window = dom.window;
  global.document = dom.window.document;
});
afterEach(() => {
  delete global.window;
  delete global.document;
  dom = null;
});

describe("index.html / cacheDom contract", () => {
  it("resolves every element cacheDom looks up", () => {
    // renderSamplerStatus wrote ~60 lines into dom.samplerStatus for a #sampler-status
    // element that did not exist in index.html, so all sample loading and error
    // feedback was invisible. Any future drift between the two fails here.
    const cached = cacheDom();
    const missing = Object.entries(cached)
      .filter(([key, value]) => value === null && !CREATED_AT_RENDER_TIME.has(key))
      .map(([key]) => key);
    expect(missing, `cacheDom keys with no matching element: ${missing.join(", ")}`).toEqual([]);
  });

  it("renders sampler rows into a real element", () => {
    const cached = cacheDom();
    expect(cached.samplerStatus).not.toBeNull();

    renderSamplerStatus(cached, {
      activeLibraryId: "local-soft",
      libraries: {
        "local-soft": {
          libraryId: "local-soft",
          label: "Piano Lite",
          phase: "progress",
          progress: 0.42,
          isDefault: true,
        },
        "fuhton-piano": { libraryId: "fuhton-piano", label: "Fuhton", phase: "standby", isDefault: false },
      },
    });

    const rows = [...cached.samplerStatus.querySelectorAll(".sampler-row")].map((row) => row.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Loading 42%");
    expect(rows[1]).toContain("Pick from menu to load");
    expect(cached.samplerStatus.classList.contains("loading")).toBe(true);
  });

  it("surfaces sampler errors", () => {
    const cached = cacheDom();
    renderSamplerStatus(cached, {
      activeLibraryId: "local-soft",
      libraries: {
        "local-soft": {
          libraryId: "local-soft",
          label: "Piano Lite",
          phase: "error",
          error: "network",
          isDefault: true,
        },
      },
    });
    expect(cached.samplerStatus.textContent).toContain("Error");
    expect(cached.samplerStatus.classList.contains("error")).toBe(true);
  });

  it("announces status-line messages to assistive technology", () => {
    const statusLine = dom.window.document.getElementById("status-line");
    expect(statusLine.getAttribute("role")).toBe("status");
    expect(statusLine.getAttribute("aria-live")).toBe("polite");
  });

  it("keeps collapse labels and aria-expanded in sync", () => {
    const cached = cacheDom();

    setMixCardCollapsed(cached, true);
    setAdvancedControlsCollapsed(cached, true);
    expect(cached.mixCardToggle.getAttribute("aria-expanded")).toBe("false");
    expect(cached.advancedControlsToggle.getAttribute("aria-expanded")).toBe("false");

    setMixCardCollapsed(cached, false);
    setAdvancedControlsCollapsed(cached, false);
    expect(cached.mixCardToggle.getAttribute("aria-expanded")).toBe("true");
    expect(cached.advancedControlsToggle.getAttribute("aria-expanded")).toBe("true");
  });
});
