import { parseRomanSymbol, buildChord, getStyleProfile, degreeToNote } from "../theory.js";
import { generateProgression, generateScale } from "../engine.js";
import { describe, it } from "vitest";
import { expectContract as expect } from "./test-helpers.js";

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
        scale
      );
      const qualities = progression.bars.map((bar) => bar.quality);
      expect(
        qualities.join(",") === "maj,maj,min,maj",
        `Pop preset should stay triadic, got ${qualities.join(",")}`
      );
    });

    it("Explicit custom extensions win over style", () => {
      const style = getStyleProfile("jazz");
      const scale = { mode: "major" };
      const key = "C";
      const dominant = buildChord("V7", key, scale, { mode: "major", styleProfile: style });
      const minorTriad = buildChord("ii", key, scale, { mode: "major", styleProfile: style });
      expect(dominant.quality === "dom7", `Expected dom7, got ${dominant.quality}`);
      expect(minorTriad.quality === "min", `Expected minor triad, got ${minorTriad.quality}`);
    });

    it("Explicit jazz romans emit sevenths", () => {
      const scale = { mode: "major" };
      const key = "C";
      const romans = ["ii7", "V7", "Imaj7"];
      const chords = romans.map((roman) => buildChord(roman, key, scale, { mode: "major" }));
      const qualities = chords.map((chord) => chord.quality);
      expect(
        qualities[0] === "min7" && qualities[1] === "dom7" && qualities[2] === "maj7",
        `Explicit jazz romans failed: ${qualities.join(", ")}`
      );
    });
  });

  describe("Degree accidental parsing", () => {
    it("Handles unicode flats and sharps", () => {
      const scale = { mode: "major", key: "C" };
      const flatThree = degreeToNote("\u266d3", scale.mode, scale);
      const sharpFour = degreeToNote("\u266f4", scale.mode, scale);
      expect(flatThree === "D#" || flatThree === "Eb", `Unexpected ♭3: ${flatThree}`);
      expect(sharpFour === "F#" || sharpFour === "Gb", `Unexpected ♯4: ${sharpFour}`);
    });
  });

  describe("Blues progression harmony", () => {
    it("Treats roman numerals diatonically in minor blues mode", () => {
      const scale = { mode: "minorBlues" };
      const key = "C";
      const progression = ["I7", "IV7", "V7"];
      const chords = progression.map((roman) => buildChord(roman, key, scale, { mode: "minorBlues" }));
      const labels = chords.map((c) => c.label);
      expect(labels[0] === "C7", `Expected C7, got ${labels[0]}`);
      expect(labels[1] === "F7", `Expected F7, got ${labels[1]}`);
      expect(labels[2] === "G7", `Expected G7, got ${labels[2]}`);
    });
  });
}

run();
