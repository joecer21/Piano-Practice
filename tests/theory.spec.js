import {
  buildChord,
  getStyleProfile,
  degreeToNote,
  degreeTokenSemitones,
  noteStringToMidi,
  SCALE_PATTERNS,
} from "../theory.js";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { generateProgression, generateScale } from "../engine.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

function run() {
  describe("Chord tagging decoupled from style", () => {
    it("Pop preset stays triadic", () => {
      const scale = generateScale({ key: "C", mode: "major" });
      const progression = generateProgression(
        {
          key: "C",
          mode: "major",
          length: 4,
          progressionPresetId: "pop-4",
        },
        scale,
      );
      const qualities = progression.bars.map((bar) => bar.quality);
      expect(qualities.join(","), `Pop preset should stay triadic, got ${qualities.join(",")}`).toBe(
        "maj,maj,min,maj",
      );
    });

    it("Explicit custom extensions win over style", () => {
      const style = getStyleProfile("jazz");
      const scale = { mode: "major" };
      const key = "C";
      const dominant = buildChord("V7", key, scale, { mode: "major", styleProfile: style });
      const minorTriad = buildChord("ii", key, scale, { mode: "major", styleProfile: style });
      expect(dominant.quality, `Expected dom7, got ${dominant.quality}`).toBe("dom7");
      expect(minorTriad.quality, `Expected minor triad, got ${minorTriad.quality}`).toBe("min");
    });

    it("Explicit jazz romans emit sevenths", () => {
      const scale = { mode: "major" };
      const key = "C";
      const romans = ["ii7", "V7", "Imaj7"];
      const chords = romans.map((roman) => buildChord(roman, key, scale, { mode: "major" }));
      const qualities = chords.map((chord) => chord.quality);
      expect(
        qualities[0] === "min7" && qualities[1] === "dom7" && qualities[2] === "maj7",
        `Explicit jazz romans failed: ${qualities.join(", ")}`,
      ).toBe(true);
    });
  });

  describe("Degree accidental parsing", () => {
    it("Handles unicode flats and sharps", () => {
      const scale = { mode: "major", key: "C" };
      const flatThree = degreeToNote("\u266d3", scale.mode, scale);
      const sharpFour = degreeToNote("\u266f4", scale.mode, scale);
      expect(["D#", "Eb"], `Unexpected ♭3: ${flatThree}`).toContain(flatThree);
      expect(["F#", "Gb"], `Unexpected ♯4: ${sharpFour}`).toContain(sharpFour);
    });

    it("measures an altered degree from the major scale in every mode", () => {
      for (const mode of Object.keys(SCALE_PATTERNS)) {
        expect(degreeToNote("b3", mode, { mode, key: "A" }), mode).toBe("C");
        expect(degreeTokenSemitones("b3", mode), mode).toBe(3);
        expect(degreeTokenSemitones("b10", mode), mode).toBe(15);
      }
      expect(degreeToNote("b7", "minor", { mode: "minor", key: "C" })).toBe("Bb");
    });

    it("reads plain degrees from the parent scale, or collection steps when asked", () => {
      expect(degreeTokenSemitones(3, "minor")).toBe(3);
      expect(degreeTokenSemitones(3, "pentatonicMinor")).toBe(3);
      expect(degreeTokenSemitones(8, "pentatonicMinor")).toBe(12);
      expect(degreeToNote(4, "pentatonicMinor", { mode: "pentatonicMinor", key: "A" })).toBe("D");
      expect(degreeTokenSemitones(3, "pentatonicMinor", "scale-step")).toBe(5);
      expect(degreeTokenSemitones(8, "pentatonicMinor", "scale-step")).toBe(17);
    });

    it("spells a lowered degree in a sharp key without flats", () => {
      expect(degreeToNote("b3", "minor", { mode: "minor", key: "D#" })).toBe("F#");
      expect(degreeToNote("b3", "major", { mode: "major", key: "Eb" })).toBe("Gb");
    });
  });

  describe("Motif flat degrees", () => {
    it("plays pent-grid's ♭3 a minor third above home in every mode", () => {
      for (const mode of Object.keys(SCALE_PATTERNS)) {
        const assignment = generateAssignment({
          ...DEFAULT_ASSIGNMENT_INPUTS,
          key: "A",
          mode,
          motifId: "pent-grid",
          seed: `pent-grid-${mode}`,
        });
        const [home, flatThree] = assignment.motif.steps
          .filter((step) => !step.rest)
          .slice(0, 2)
          .map((step) => noteStringToMidi(step.note));
        expect(flatThree - home, mode).toBe(3);
      }
    });
  });

  describe("Blues progression harmony", () => {
    it("Treats roman numerals diatonically in minor blues mode", () => {
      const scale = { mode: "minorBlues" };
      const key = "C";
      const progression = ["I7", "IV7", "V7"];
      const chords = progression.map((roman) => buildChord(roman, key, scale, { mode: "minorBlues" }));
      const labels = chords.map((c) => c.label);
      expect(labels[0], `Expected C7, got ${labels[0]}`).toBe("C7");
      expect(labels[1], `Expected F7, got ${labels[1]}`).toBe("F7");
      expect(labels[2], `Expected G7, got ${labels[2]}`).toBe("G7");
    });
  });
}

run();
