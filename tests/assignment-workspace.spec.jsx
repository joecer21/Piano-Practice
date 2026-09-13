// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssignmentWorkspace } from "../coach/AssignmentWorkspace.tsx";
import { DEFAULT_ASSIGNMENT_INPUTS } from "../domain/assignment.js";
import { PROGRESSION_PRESETS } from "../theory.js";

afterEach(cleanup);

function createEditor(overrides = {}) {
  const listeners = new Set();
  let snapshot = {
    inputs: { ...DEFAULT_ASSIGNMENT_INPUTS, customProgressionRoman: [] },
    locks: { key: false, harmony: false, groove: false, motif: false },
    assignmentId: "assignment-00abc123",
    seed: "variation-7",
    canUndo: true,
    canRedo: false,
    ...overrides,
  };
  const success = { ok: true, message: "Assignment updated" };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply: vi.fn(() => success),
    applyPreset: vi.fn(() => success),
    reroll: vi.fn(() => success),
    undo: vi.fn(() => success),
    redo: vi.fn(() => success),
    toggleLock: vi.fn(),
    publish(patch) {
      snapshot = { ...snapshot, ...patch };
      listeners.forEach((listener) => listener());
    },
  };
}

function renderWorkspace(editor = createEditor()) {
  const detailsRef = { current: null };
  render(<AssignmentWorkspace editor={editor} detailsRef={detailsRef} />);
  fireEvent.click(screen.getByText("Change the assignment"));
  return { editor, detailsRef };
}

describe("AssignmentWorkspace", () => {
  it("renders the complete catalog and explains motif availability", () => {
    const { editor } = renderWorkspace();
    const progression = screen.getByLabelText("Chords");
    expect(progression.options).toHaveLength(PROGRESSION_PRESETS.length + 1);
    PROGRESSION_PRESETS.forEach((preset) => {
      const option = [...progression.options].find((candidate) => candidate.value === preset.id);
      expect(option?.textContent).toContain(preset.roman.join("–"));
    });
    expect([...progression.options].at(-1).textContent).toMatch(/Custom progression/);
    expect(screen.getByText("variation-7")).toBeTruthy();
    expect(screen.getByText(/ID 00abc123/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Colour"), { target: { value: "majorBlues" } });
    const motif = screen.getByLabelText("Tune");
    expect([...motif.options].find((option) => option.value === "funk-sync").disabled).toBe(true);
    expect([...motif.options].find((option) => option.value === "funk-sync-6").disabled).toBe(false);
    expect(editor.apply).not.toHaveBeenCalled();
  });

  it("keeps edits in a draft until they are applied, and can reset them", () => {
    const { editor } = renderWorkspace();
    const key = screen.getByLabelText("Key");
    const apply = screen.getByRole("button", { name: "Apply assignment" });
    expect(apply.disabled).toBe(true);

    fireEvent.change(key, { target: { value: "G" } });
    expect(editor.apply).not.toHaveBeenCalled();
    expect(apply.disabled).toBe(false);
    expect(screen.getByText("Changes are ready to apply.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
    expect(key.value).toBe("C");
    expect(apply.disabled).toBe(true);

    fireEvent.change(key, { target: { value: "G" } });
    fireEvent.click(apply);
    expect(editor.apply).toHaveBeenCalledWith(expect.objectContaining({ key: "G" }));
    expect(screen.getByText("Assignment updated")).toBeTruthy();
  });

  it("treats an empty custom progression as a recoverable draft", () => {
    const { editor } = renderWorkspace();
    fireEvent.change(screen.getByLabelText("Chords"), { target: { value: "custom" } });
    expect(screen.getByRole("alert").textContent).toContain("Add at least one chord");
    expect(screen.getByRole("button", { name: "Apply assignment" }).disabled).toBe(true);

    const palette = screen.getByRole("group", { name: "Custom progression (0 bars)" });
    fireEvent.click(within(palette).getAllByRole("button")[0]);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply assignment" }));
    expect(editor.apply).toHaveBeenCalledWith(
      expect.objectContaining({ progressionPresetId: "custom", customProgressionRoman: ["I"] }),
    );
  });

  it("shows the style-aware chord quality in a custom palette and preview", () => {
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "jazz" } });
    fireEvent.change(screen.getByLabelText("Chords"), { target: { value: "custom" } });

    const palette = screen.getByRole("group", { name: "Custom progression (0 bars)" });
    fireEvent.click(within(palette).getByRole("button", { name: "ii7" }));
    expect(screen.getByText("ii7", { selector: "#custom-progression-preview" })).toBeTruthy();
  });

  it("routes presets, locks, rerolls, and history through the editor service", () => {
    const editor = createEditor({ canRedo: true });
    renderWorkspace(editor);

    fireEvent.click(screen.getByRole("button", { name: /Gritty and leaning/ }));
    expect(editor.applyPreset).toHaveBeenCalledWith("blues-a");

    fireEvent.click(screen.getByRole("button", { name: "Lock key" }));
    expect(editor.toggleLock).toHaveBeenCalledWith("key");
    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(editor.reroll).toHaveBeenCalledOnce();
    expect(editor.undo).toHaveBeenCalledOnce();
    expect(editor.redo).toHaveBeenCalledOnce();
  });
});
