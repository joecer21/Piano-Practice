import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheDom } from "../ui.js";

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
    // The remaining reference renderer is still ID-based. Any drift between its
    // cache and the static reference markup should fail here, not in the browser.
    const cached = cacheDom();
    const missing = Object.entries(cached)
      .filter(([key, value]) => value === null && !CREATED_AT_RENDER_TIME.has(key))
      .map(([key]) => key);
    expect(missing, `cacheDom keys with no matching element: ${missing.join(", ")}`).toEqual([]);
  });

  it("announces status-line messages to assistive technology", () => {
    const statusLine = dom.window.document.getElementById("status-line");
    expect(statusLine.getAttribute("role")).toBe("status");
    expect(statusLine.getAttribute("aria-live")).toBe("polite");
  });

  it("provides React mount slots for the coach and its settings", () => {
    expect(dom.window.document.getElementById("coach-root")).not.toBeNull();
    expect(dom.window.document.getElementById("coach-settings")).not.toBeNull();
  });
});
