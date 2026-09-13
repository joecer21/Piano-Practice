// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { applyKeyboardOverlay, clearKeyboardOverlay, pitchRange } from "../coach/keyboard-overlay.ts";

function scoreFor(inputs) {
  return buildScore(generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, ...inputs }));
}

function buildKeys(notes) {
  const container = document.createElement("div");
  notes.forEach((note) => {
    const key = document.createElement("button");
    key.className = "piano-key";
    key.dataset.note = note;
    key.setAttribute("aria-label", `${note} piano key`);
    container.append(key);
  });
  return container;
}

const OCTAVE = ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"];

describe("keyboard overlay", () => {
  let score;
  let container;
  const key = (note) => container.querySelector(`[data-note="${note}"]`);

  beforeEach(() => {
    score = scoreFor({ key: "C", mode: "major", progressionPresetId: "pop-4", seed: "overlay" });
    container = buildKeys(OCTAVE);
  });

  it("labels the current bar's chord in degrees and marks the root", () => {
    expect(score.bars[0].rootPitchClass).toBe(0);
    applyKeyboardOverlay(container, { score, barIndex: 0, lens: "both", labelMode: "degrees" });

    expect(key("C4").dataset.role).toBe("root");
    expect(key("C4").querySelector(".key-label")?.textContent).toBe("1");
    expect(key("E4").dataset.role).toBe("chordTone");
    expect(key("E4").querySelector(".key-label")?.textContent).toBe("3");
    expect(key("D4").dataset.role).toBe("scaleTone");
    expect(key("C#4").dataset.role).toBe("chromatic");
    expect(key("C#4").querySelector(".key-label")).toBeNull();
  });

  it("labels a tone borrowed from the parent scale, distinct from the collection and from outside notes", () => {
    const pentatonic = scoreFor({
      key: "C",
      mode: "pentatonicMinor",
      progressionPresetId: "pop-4",
      seed: "overlay",
    });
    applyKeyboardOverlay(container, { score: pentatonic, barIndex: 0, lens: "both", labelMode: "degrees" });

    // C minor pentatonic is C E♭ F G B♭; its parent, natural minor, adds D and A♭.
    expect(key("F4").dataset.role).toBe("scaleTone");
    expect(key("D4").dataset.role).toBe("parentScaleTone");
    expect(key("D4").querySelector(".key-label")?.textContent).toBe("2");
    expect(key("D4").getAttribute("aria-label")).toBe(
      "D4 piano key, degree 2, borrowed from the parent scale",
    );
    expect(key("A4").dataset.role).toBe("chromatic");
    expect(key("A4").querySelector(".key-label")).toBeNull();
  });

  it("follows the bar: a different chord moves the root marker", () => {
    const otherBar = score.bars.findIndex((bar) => bar.rootPitchClass !== 0);
    expect(otherBar).toBeGreaterThan(0);
    applyKeyboardOverlay(container, { score, barIndex: otherBar, lens: "both", labelMode: "degrees" });
    const roots = [...container.querySelectorAll('[data-role="root"]')];
    expect(roots).toHaveLength(1);
    expect(roots[0].dataset.note).not.toBe("C4");
  });

  it("switches labels to letters without changing roles", () => {
    applyKeyboardOverlay(container, { score, barIndex: 0, lens: "both", labelMode: "letters" });
    expect(key("E4").querySelector(".key-label")?.textContent).toBe("E");
    expect(key("E4").dataset.role).toBe("chordTone");
  });

  it("describes each key's role to assistive technology", () => {
    applyKeyboardOverlay(container, { score, barIndex: 0, lens: "both", labelMode: "degrees" });
    expect(key("C4").getAttribute("aria-label")).toBe("C4 piano key, degree 1, root");
    expect(key("C#4").getAttribute("aria-label")).toBe("C#4 piano key, outside the scale");
  });

  it("dims keys outside the isolated hand's range", () => {
    const range = pitchRange(score, "lh");
    expect(range).not.toBeNull();
    const wide = buildKeys(["C1", "C3", "C7"]);
    applyKeyboardOverlay(wide, { score, barIndex: 0, lens: "lh", labelMode: "degrees" });
    const inRange = (midi) => midi >= range[0] && midi <= range[1];
    expect(wide.querySelector('[data-note="C7"]').dataset.outOfLens).toBe("true");
    expect(Boolean(wide.querySelector('[data-note="C3"]').dataset.outOfLens)).toBe(!inRange(48));
  });

  it("never assigns a hand class: hue stays reserved for the sounding hand", () => {
    applyKeyboardOverlay(container, { score, barIndex: 0, lens: "lh", labelMode: "degrees" });
    expect(container.querySelectorAll(".lh, .rh, .active")).toHaveLength(0);
  });

  it("clears every fact it added", () => {
    applyKeyboardOverlay(container, { score, barIndex: 0, lens: "lh", labelMode: "degrees" });
    clearKeyboardOverlay(container);
    expect(
      container.querySelectorAll("[data-role], [data-degree], [data-out-of-lens], .key-label"),
    ).toHaveLength(0);
    expect(key("C4").getAttribute("aria-label")).toBe("C4 piano key");
  });
});
