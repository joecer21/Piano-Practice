import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cachePianoDom } from "../components/piano-interactions.js";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

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

describe("index.html / Live Piano host contract", () => {
  it("resolves every element cachePianoDom looks up", () => {
    // Piano interactions remain ID-based. Catch drift between that small host
    // contract and the static keyboard markup before reaching the browser.
    const cached = cachePianoDom();
    const missing = Object.entries(cached)
      .filter(([, value]) => value === null)
      .map(([key]) => key);
    expect(missing, `Live Piano host keys with no matching element: ${missing.join(", ")}`).toEqual([]);
  });

  it("provides React mount slots for the coach and its settings", () => {
    expect(dom.window.document.getElementById("coach-root")).not.toBeNull();
    expect(dom.window.document.getElementById("coach-settings")).not.toBeNull();
  });
});
