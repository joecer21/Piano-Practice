// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { browserStorage, subscribeToStorageKey } from "../infrastructure/browser-storage.ts";
import { UPDATE_CHECK_INTERVAL_MS, createOfflineSupport } from "../infrastructure/pwa.ts";
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

  it("reports storage changes from other tabs for one key, and stops when unsubscribed", () => {
    const changed = vi.fn();
    const unsubscribe = subscribeToStorageKey(window, "piano-practice:library", changed);
    window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }));
    expect(changed).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: "piano-practice:library" }));
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe();
    window.dispatchEvent(new StorageEvent("storage", { key: "piano-practice:library" }));
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("registers the service worker at load and can cancel a pending registration", async () => {
    const { environment, container, fire } = pwaEnvironment({ readyState: "loading" });
    const offline = createOfflineSupport(environment);

    expect(container.register).not.toHaveBeenCalled();
    fire("load");
    expect(container.register).toHaveBeenCalledWith("./sw.js");
    offline.dispose();
    expect(environment.events.removeEventListener).toHaveBeenCalledWith("load", expect.any(Function));
  });

  it("is inert outside production or without service-worker support", () => {
    const development = pwaEnvironment({ production: false });
    const unsupported = pwaEnvironment();
    unsupported.environment.serviceWorker = null;
    for (const { environment, container } of [development, unsupported]) {
      const offline = createOfflineSupport(environment);
      expect(offline.getSnapshot()).toEqual({ offlineReady: false, update: "none", cacheVersion: null });
      offline.applyUpdate();
      expect(environment.reload).not.toHaveBeenCalled();
      expect(container.register).not.toHaveBeenCalled();
    }
  });

  it("reports offline readiness and the cache version once a worker is active", async () => {
    const active = fakeWorker({ version: "v1", includes: true });
    const { environment } = pwaEnvironment({ controller: active, registration: { active } });
    const offline = createOfflineSupport(environment);
    await settle();
    expect(offline.getSnapshot()).toEqual({ offlineReady: true, update: "none", cacheVersion: "v1" });
  });

  it("activates a waiting version silently when the page already runs it", async () => {
    const waiting = fakeWorker({ version: "v2", includes: true });
    const { environment } = pwaEnvironment({
      controller: fakeWorker({ version: "v1" }),
      registration: { waiting },
    });
    const offline = createOfflineSupport(environment);
    await settle();
    expect(waiting.messages).toContainEqual({ type: "SKIP_WAITING" });
    expect(offline.getSnapshot().update).toBe("none");
    expect(environment.reload).not.toHaveBeenCalled();
  });

  it("offers an out-of-date page the update, and reloads only when asked", async () => {
    const waiting = fakeWorker({ version: "v2", includes: false });
    const { environment, container } = pwaEnvironment({
      controller: fakeWorker({ version: "v1", includes: true }),
      registration: { waiting },
    });
    const offline = createOfflineSupport(environment);
    const changed = vi.fn();
    offline.subscribe(changed);
    await settle();

    expect(offline.getSnapshot().update).toBe("available");
    expect(changed).toHaveBeenCalled();
    expect(waiting.messages).not.toContainEqual({ type: "SKIP_WAITING" });

    offline.applyUpdate();
    expect(offline.getSnapshot().update).toBe("applying");
    expect(waiting.messages).toContainEqual({ type: "SKIP_WAITING" });
    expect(environment.reload).not.toHaveBeenCalled();
    container.controller = waiting;
    container.fire("controllerchange");
    container.fire("controllerchange");
    expect(environment.reload).toHaveBeenCalledOnce();
  });

  it("considers a version that finishes installing after the page opened", async () => {
    const installing = fakeWorker({ version: "v2", includes: false, state: "installing" });
    const registration = fakeRegistration({});
    const { environment } = pwaEnvironment({ controller: fakeWorker({ version: "v1" }), registration });
    const offline = createOfflineSupport(environment);
    await settle();

    registration.installing = installing;
    registration.fire("updatefound");
    installing.setState("installed");
    await settle();
    expect(offline.getSnapshot().update).toBe("available");
  });

  it("does not offer the first install as an update", async () => {
    const installing = fakeWorker({ version: "v1", includes: true, state: "installing" });
    const { environment, container } = pwaEnvironment({ registration: { installing } });
    const offline = createOfflineSupport(environment);
    await settle();
    installing.setState("installed");
    await settle();
    expect(installing.messages).not.toContainEqual({ type: "SKIP_WAITING" });

    container.controller = installing;
    container.fire("controllerchange");
    await settle();
    expect(offline.getSnapshot()).toEqual({ offlineReady: true, update: "none", cacheVersion: "v1" });
  });

  it("offers a reload when another tab activates a version this page is not running", async () => {
    const current = fakeWorker({ version: "v1", includes: true });
    const { environment, container } = pwaEnvironment({
      controller: current,
      registration: { active: current },
    });
    const offline = createOfflineSupport(environment);
    await settle();

    container.controller = fakeWorker({ version: "v2", includes: false });
    container.fire("controllerchange");
    await settle();
    expect(offline.getSnapshot()).toMatchObject({ update: "available", cacheVersion: "v2" });
    offline.applyUpdate();
    expect(environment.reload).toHaveBeenCalledOnce();
  });

  it("checks for a new version when the app becomes visible, at most every half hour", async () => {
    let clock = 0;
    const registration = fakeRegistration({});
    const { environment, fire } = pwaEnvironment({ registration, now: () => clock });
    createOfflineSupport(environment);
    await settle();

    fire("visibilitychange");
    expect(registration.update).not.toHaveBeenCalled();
    clock = UPDATE_CHECK_INTERVAL_MS + 1;
    environment.document.visibilityState = "hidden";
    fire("visibilitychange");
    expect(registration.update).not.toHaveBeenCalled();
    environment.document.visibilityState = "visible";
    fire("visibilitychange");
    fire("visibilitychange");
    expect(registration.update).toHaveBeenCalledOnce();
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

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

function emitter() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    }),
    removeEventListener: vi.fn((type, listener) => listeners.get(type)?.delete(listener)),
    fire: (type) => [...(listeners.get(type) ?? [])].forEach((listener) => listener()),
  };
}

/** A worker that answers DESCRIBE like offline/service-worker.js and records every message. */
function fakeWorker({ version, includes = false, state = "installed" }) {
  const events = emitter();
  const worker = {
    ...events,
    state,
    messages: [],
    postMessage(message, ports = []) {
      worker.messages.push(message);
      if (message.type === "DESCRIBE") ports[0].postMessage({ version, includes });
    },
    setState(next) {
      worker.state = next;
      events.fire("statechange");
    },
  };
  return worker;
}

function fakeRegistration({ waiting = null, installing = null, active = null }) {
  return { ...emitter(), waiting, installing, active, update: vi.fn(async () => {}) };
}

function pwaEnvironment({
  production = true,
  readyState = "complete",
  controller = null,
  registration,
  now,
} = {}) {
  const windowEvents = emitter();
  const documentEvents = emitter();
  const reg = registration?.update ? registration : fakeRegistration(registration ?? {});
  const container = { ...emitter(), controller, register: vi.fn(async () => reg) };
  const environment = {
    production,
    document: { readyState, visibilityState: "visible", ...documentEvents },
    events: windowEvents,
    serviceWorker: container,
    currentScriptUrl: "https://example.test/assets/main-abc.js",
    reload: vi.fn(),
    now,
  };
  return {
    environment,
    container,
    fire: (type) => (type === "load" ? windowEvents.fire(type) : documentEvents.fire(type)),
  };
}
