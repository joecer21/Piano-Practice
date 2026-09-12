import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheDom, setStatusMessage, showHint } from "../ui.js";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const HINT = "Add at least one chord to use your custom palette.";
const AMBIENT = "Piano Lite - Soft ready for playback";

// ui.js binds setTimeout into a module-level constant at import time, so fake
// timers installed afterwards never reach it. Use short real durations instead.
const SHORT = 40;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let dom;
let cached;
beforeEach(() => {
  dom = new JSDOM(html);
  global.window = dom.window;
  global.document = dom.window.document;
  cached = cacheDom();
});
afterEach(() => {
  delete global.window;
  delete global.document;
});

describe("status line priority", () => {
  it("does not let ambient status overwrite an actionable hint", () => {
    showHint(cached, HINT);
    expect(cached.statusLine.textContent).toContain("Add at least one chord");

    // Sample loading finishes asynchronously and lands on the same single
    // last-writer-wins channel; it used to wipe the hint mid-read.
    setStatusMessage(cached, AMBIENT, { tone: "success", ambient: true });
    expect(cached.statusLine.textContent).toContain("Add at least one chord");
  });

  it("shows the deferred message once the hint expires", async () => {
    setStatusMessage(cached, HINT, { tone: "hint", transient: true, duration: SHORT });
    setStatusMessage(cached, AMBIENT, { tone: "success", ambient: true });
    expect(cached.statusLine.textContent).toBe(HINT);

    await wait(SHORT * 3);
    expect(cached.statusLine.textContent).toBe(AMBIENT);
  });

  it("still lets an error take over immediately", () => {
    showHint(cached, HINT);
    setStatusMessage(cached, "Sample load failed", { tone: "error" });
    expect(cached.statusLine.textContent).toBe("Sample load failed");
    expect(cached.statusLine.dataset.tone).toBe("error");
  });

  it("lets a message the user triggered take effect immediately", () => {
    showHint(cached, HINT);
    // Clicking Generate is not ambient, so its result must not be deferred.
    setStatusMessage(cached, "Assignment updated for C major", { tone: "success" });
    expect(cached.statusLine.textContent).toBe("Assignment updated for C major");
  });

  it("replaces a hint with a newer hint", () => {
    showHint(cached, "First hint");
    showHint(cached, "Second hint");
    expect(cached.statusLine.textContent).toBe("Second hint");
  });
});
