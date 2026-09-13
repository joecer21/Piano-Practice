import { describe, expect, it, vi } from "vitest";
import { createShareController } from "../application/share-controller.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, normalizeAssignmentInputs } from "../domain/assignment.js";
import { encodeShareFragment } from "../domain/share.ts";

function harness({ fragment = "", current = null, opens = true } = {}) {
  let value = fragment;
  let locationListener = null;
  const location = {
    currentUrl: () => `https://example.test/practice${value}`,
    fragment: () => value,
    replaceFragment: vi.fn((next) => {
      value = `#${next}`;
    }),
    subscribe: vi.fn((listener) => {
      locationListener = listener;
      return () => {
        locationListener = null;
      };
    }),
  };
  const beforeOpen = vi.fn();
  const openInputs = vi.fn(() => opens);
  const controller = createShareController({
    location,
    currentInputs: () => current,
    openInputs,
    beforeOpen,
  });
  return { controller, location, beforeOpen, openInputs, notify: () => locationListener?.() };
}

describe("share controller", () => {
  const inputs = normalizeAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS);
  const fragment = `#${encodeShareFragment(inputs)}`;

  it("opens a valid shared assignment through application commands", () => {
    const app = harness({ fragment });
    expect(app.controller.openLocation()).toEqual({ opened: true, error: null });
    expect(app.beforeOpen).toHaveBeenCalledOnce();
    expect(app.openInputs).toHaveBeenCalledWith(inputs);
  });

  it("does not reopen the current assignment and explains invalid links", () => {
    const current = harness({ fragment, current: inputs });
    expect(current.controller.openLocation()).toEqual({ opened: true, error: null });
    expect(current.beforeOpen).not.toHaveBeenCalled();

    const invalid = harness({ fragment: "#v=1&unknown=yes" });
    expect(invalid.controller.openLocation()).toMatchObject({ opened: false, error: expect.any(String) });
    expect(invalid.beforeOpen).not.toHaveBeenCalled();
  });

  it("keeps the address and share URL synchronized with the committed assignment", () => {
    const app = harness({ current: inputs });
    app.controller.rememberCurrent();
    expect(app.location.replaceFragment).toHaveBeenCalledWith(encodeShareFragment(inputs));
    expect(app.controller.currentShareUrl()).toContain(`#${encodeShareFragment(inputs)}`);
  });

  it("turns hash changes into decoded application results and disposes the listener", () => {
    const app = harness({ fragment });
    const listener = vi.fn();
    const unsubscribe = app.controller.subscribe(listener);
    app.notify();
    expect(listener).toHaveBeenCalledWith({ opened: true, error: null });
    unsubscribe();
    app.notify();
    expect(listener).toHaveBeenCalledOnce();
  });
});
