// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScaleReference } from "../coach/ScaleReference.tsx";

function createAudition() {
  const listeners = new Set();
  let snapshot = { playing: false, activeNote: null };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play: vi.fn(async () => {}),
    stop: vi.fn(),
    publish(next) {
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(cleanup);

describe("ScaleReference", () => {
  const scale = { name: "A minor pentatonic", notes: ["A", "C", "D", "E", "G"] };

  it("shows the scale in order and auditions it with the requested loop setting", async () => {
    const audition = createAudition();
    render(<ScaleReference scale={scale} audition={audition} ready />);

    expect(screen.getByRole("heading", { name: scale.name })).toBeTruthy();
    expect(
      [...screen.getByRole("list", { name: "Scale notes" }).children].map((note) => note.textContent),
    ).toEqual(scale.notes);

    fireEvent.click(screen.getByLabelText("Loop"));
    fireEvent.click(screen.getByRole("button", { name: "Play scale" }));
    expect(audition.play).toHaveBeenCalledWith(true);
  });

  it("tracks the sounding pitch and delegates stopping", async () => {
    const audition = createAudition();
    render(<ScaleReference scale={scale} audition={audition} ready />);

    await act(async () => audition.publish({ playing: true, activeNote: "C4" }));
    expect(screen.getByText("C").getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Stop scale" }));
    expect(audition.stop).toHaveBeenCalledOnce();
  });

  it("does not audition before the piano is ready or without a scale", () => {
    const audition = createAudition();
    const { rerender } = render(<ScaleReference scale={scale} audition={audition} ready={false} />);
    expect(screen.getByRole("button", { name: "Play scale" }).disabled).toBe(true);

    rerender(<ScaleReference scale={null} audition={audition} ready />);
    expect(screen.getByRole("button", { name: "Play scale" }).disabled).toBe(true);
  });
});
