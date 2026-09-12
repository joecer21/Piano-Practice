import { describe, expect, it } from "vitest";
import { noteStringToMidi, stripOctave } from "../theory.js";

describe("noteStringToMidi", () => {
  it("parses the standard range", () => {
    expect(noteStringToMidi("C4")).toBe(60);
    expect(noteStringToMidi("A0")).toBe(21);
    expect(noteStringToMidi("G9")).toBe(127);
    expect(noteStringToMidi("  A4  ")).toBe(69);
  });

  it("treats enharmonic spellings as equal", () => {
    expect(noteStringToMidi("Eb3")).toBe(noteStringToMidi("D#3"));
    expect(noteStringToMidi("Gb4")).toBe(noteStringToMidi("F#4"));
    expect(noteStringToMidi("E♭3")).toBe(noteStringToMidi("Eb3"));
    expect(noteStringToMidi("D♯3")).toBe(noteStringToMidi("D#3"));
  });

  it("parses negative and two-digit octaves", () => {
    // Positional parsing split "C-1" into the name "C-" and the octave 1,
    // looked up NOTE_TO_INDEX["C-"] === undefined, and returned NaN.
    expect(noteStringToMidi("C-1")).toBe(0);
    expect(noteStringToMidi("F#-1")).toBe(6);
    expect(noteStringToMidi("C10")).toBe(132); // parsed faithfully; range is the caller's concern
  });

  it("returns NaN for unparseable input instead of a plausible wrong answer", () => {
    for (const input of ["", "C", "H4", "Cb#4", "4", "C4x", null, undefined, 60, {}]) {
      expect(noteStringToMidi(input), `${JSON.stringify(input)} should be NaN`).toBeNaN();
    }
  });
});

describe("stripOctave", () => {
  it("removes trailing octaves including negative ones", () => {
    expect(stripOctave("C#4")).toBe("C#");
    expect(stripOctave("Bb3")).toBe("Bb");
    expect(stripOctave("C-1")).toBe("C"); // previously "C-"
    expect(stripOctave("C")).toBe("C");
  });

  it("is total over non-string input", () => {
    expect(stripOctave(undefined)).toBe("");
    expect(stripOctave(null)).toBe("");
  });
});
