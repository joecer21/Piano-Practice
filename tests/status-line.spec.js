// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusService } from "../application/status.ts";
import { StatusLine } from "../coach/StatusLine.tsx";

const HINT = "Add at least one chord to use your custom palette.";
const AMBIENT = "Piano Lite - Soft ready for playback";
const SHORT = 40;

let status;
const show = (...args) => act(() => status.show(...args));
const hint = (...args) => act(() => status.hint(...args));
beforeEach(() => {
  vi.useFakeTimers();
  status = createStatusService();
  render(createElement(StatusLine, { status }));
});
afterEach(() => {
  status.dispose();
  cleanup();
  vi.useRealTimers();
});

describe("status line priority", () => {
  it("announces application feedback to assistive technology", () => {
    const line = screen.getByRole("status");
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(line.getAttribute("aria-atomic")).toBe("true");
  });

  it("does not let ambient status overwrite an actionable hint", () => {
    hint(HINT);
    expect(screen.getByRole("status").textContent).toContain("Add at least one chord");

    // Sample loading finishes asynchronously and lands on the same single
    // last-writer-wins channel; it used to wipe the hint mid-read.
    show(AMBIENT, { tone: "success", ambient: true });
    expect(screen.getByRole("status").textContent).toContain("Add at least one chord");
  });

  it("shows the deferred message once the hint expires", () => {
    show(HINT, { tone: "hint", transient: true, duration: SHORT });
    show(AMBIENT, { tone: "success", ambient: true });
    expect(screen.getByRole("status").textContent).toBe(HINT);

    act(() => vi.advanceTimersByTime(SHORT));
    expect(screen.getByRole("status").textContent).toBe(AMBIENT);
  });

  it("still lets an error take over immediately", () => {
    hint(HINT);
    show("Sample load failed", { tone: "error" });
    expect(screen.getByRole("status").textContent).toBe("Sample load failed");
    expect(screen.getByRole("status").dataset.tone).toBe("error");
  });

  it("lets a message the user triggered take effect immediately", () => {
    hint(HINT);
    // Clicking Generate is not ambient, so its result must not be deferred.
    show("Assignment updated for C major", { tone: "success" });
    expect(screen.getByRole("status").textContent).toBe("Assignment updated for C major");
  });

  it("replaces a hint with a newer hint", () => {
    hint("First hint");
    hint("Second hint");
    expect(screen.getByRole("status").textContent).toBe("Second hint");
  });
});
