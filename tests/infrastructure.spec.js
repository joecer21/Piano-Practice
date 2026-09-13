// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { browserStorage } from "../infrastructure/browser-storage.ts";
import { registerOfflineSupport } from "../infrastructure/pwa.ts";
import { createShareLocation } from "../infrastructure/share-location.ts";
import { createRuntimeTestAdapter } from "../infrastructure/test-adapter.ts";

describe("browser infrastructure", () => {
  it("isolates share-fragment reads, writes and hashchange subscriptions", () => {
    window.history.replaceState(null, "", "/practice?from=test#old");
    const location = createShareLocation(window);
    const changed = vi.fn();
    const unsubscribe = location.subscribe(changed);

    expect(location.fragment()).toBe("#old");
    location.replaceFragment("v=1&key=C");
    expect(location.currentUrl()).toContain("/practice?from=test#v=1&key=C");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(changed).toHaveBeenCalledOnce();

    unsubscribe();
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(changed).toHaveBeenCalledOnce();
  });

  it("returns null when localStorage is unavailable", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    expect(browserStorage({ localStorage: storage })).toBe(storage);
    const blocked = {};
    Object.defineProperty(blocked, "localStorage", {
      get() {
        throw new DOMException("blocked");
      },
    });
    expect(browserStorage(blocked)).toBeNull();
  });

  it("registers the service worker at load and can cancel a pending registration", async () => {
    const listeners = new Map();
    const events = {
      addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      }),
    };
    const register = vi.fn(async () => ({}));
    const dispose = registerOfflineSupport({
      production: true,
      document: { readyState: "loading" },
      events,
      serviceWorker: { register },
    });

    expect(register).not.toHaveBeenCalled();
    listeners.get("load")();
    expect(register).toHaveBeenCalledWith("./sw.js");
    await register.mock.results[0].value;
    dispose();
    expect(events.removeEventListener).toHaveBeenCalledWith("load", expect.any(Function));
  });

  it("does nothing outside production or without service-worker support", () => {
    const events = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    registerOfflineSupport({
      production: false,
      document: { readyState: "complete" },
      events,
      serviceWorker: { register: vi.fn() },
    });
    registerOfflineSupport({
      production: true,
      document: { readyState: "complete" },
      events,
      serviceWorker: null,
    });
    expect(events.addEventListener).not.toHaveBeenCalled();
  });

  it("publishes runtime diagnostics through one disposable test surface", () => {
    const sampler = { activeLibraryId: "local", libraries: {} };
    const adapter = createRuntimeTestAdapter(window, { sampler, transport: "stopped" });
    adapter.setTransport("started");
    adapter.setPlayback({ parts: ["lh"], barRange: [2, 2], rate: 0.5, loop: true, countIn: false });

    expect(window.__PIANO_PRACTICE_TEST__).toMatchObject({
      sampler,
      transport: "started",
      playback: { parts: ["lh"], barRange: [2, 2], rate: 0.5, loop: true, countIn: false },
    });
    adapter.dispose();
    expect(window.__PIANO_PRACTICE_TEST__).toBeUndefined();
  });
});
