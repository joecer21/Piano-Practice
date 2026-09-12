import { buildChord, getStyleProfile, degreeToNote } from "../theory.js";
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
