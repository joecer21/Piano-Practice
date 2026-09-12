import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { attachPianoNoteListeners, buildPianoVisual, renderPianoDiatonic } from "../components/piano.js";
import { getLivePianoChordNotes } from "../domain/live-piano.js";

let environment;

function setupPiano() {
  environment = new JSDOM('<!doctype html><div id="piano-visual"></div>');
  global.window = environment.window;
  global.document = environment.window.document;
  const dom = {
    pianoVisual: document.getElementById("piano-visual"),
    __pianoIndicatorMode: "both",
  };
  buildPianoVisual(dom);
  return dom;
}

afterEach(() => {
  environment?.window.close();
  delete global.window;
  delete global.document;
});

describe("Live Piano", () => {
  it("builds the recovered C2-E6 keyboard", () => {
    const dom = setupPiano();
    expect(dom.pianoVisual.querySelectorAll(".piano-key")).toHaveLength(53);
    expect(dom.pianoVisual.querySelectorAll(".piano-key.white")).toHaveLength(31);
    expect(dom.pianoVisual.querySelector('[data-note="C2"]')).toBeTruthy();
    expect(dom.pianoVisual.querySelector('[data-note="E6"]')).toBeTruthy();
  });

  it("uses a focused C3-C5 range for phone-sized layouts", () => {
    const dom = setupPiano();
    buildPianoVisual(dom, { compact: true });

    expect(dom.pianoVisual.querySelectorAll(".piano-key")).toHaveLength(25);
    expect(dom.pianoVisual.dataset.rangeStart).toBe("C3");
    expect(dom.pianoVisual.dataset.rangeEnd).toBe("C5");
    expect(dom.pianoVisual.querySelector('[data-note="C2"]')).toBeNull();
    expect(dom.pianoVisual.querySelector('[data-note="C4"]').tabIndex).toBe(0);
  });

  it("lights enharmonic keys and distinguishes left from right hand", () => {
    const dom = setupPiano();
    const detach = attachPianoNoteListeners(dom);
    const key = dom.pianoVisual.querySelector('[data-note="C#4"]');

    window.dispatchEvent(
      new window.CustomEvent("note-play", {
        detail: { note: "Db4", part: "left" },
      }),
    );
    expect(key.classList.contains("active")).toBe(true);
    expect(key.classList.contains("lh")).toBe(true);

    window.dispatchEvent(
      new window.CustomEvent("note-stop", {
        detail: { note: "Db4", part: "left" },
      }),
    );
    expect(key.classList.contains("active")).toBe(false);

    dom.__pianoIndicatorMode = "lh";
    window.dispatchEvent(
      new window.CustomEvent("note-play", {
        detail: { note: "C#4", part: "lead" },
      }),
    );
    expect(key.classList.contains("active")).toBe(false);
    detach();
  });

  it("marks notes outside the generated scale", () => {
    const dom = setupPiano();
    renderPianoDiatonic(dom, { notes: ["C", "D", "E", "F", "G", "A", "B"] });
    expect(dom.pianoVisual.querySelector('[data-note="C4"]').classList.contains("nondiatonic")).toBe(false);
    expect(dom.pianoVisual.querySelector('[data-note="C#4"]').classList.contains("nondiatonic")).toBe(true);
  });
});

describe("Live Piano chord shapes", () => {
  const cMajor = { notes: ["C", "D", "E", "F", "G", "A", "B"] };

  it("builds static and scale-aware shapes", () => {
    expect(getLivePianoChordNotes("C4", "maj7", cMajor)).toEqual(["C4", "E4", "G4", "B4"]);
    expect(getLivePianoChordNotes("D4", "diatonic-triad", cMajor)).toEqual(["D4", "F4", "A4"]);
    expect(getLivePianoChordNotes("B4", "diatonic-7th", cMajor)).toEqual(["B4", "D5", "F5", "A5"]);
  });

  it("keeps expanded shapes inside the visible keyboard", () => {
    const notes = getLivePianoChordNotes("B5", "add9", cMajor);
    expect(notes).toEqual(["B4", "D#5", "F#5", "C#6"]);
  });
});
