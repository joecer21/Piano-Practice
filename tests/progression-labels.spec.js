import {
  parseRomanSymbol,
  getChordTagForSymbol,
  labelRomanWithTag,
  analyzeRomanAgainstMode,
  buildChord,
  SCALE_PATTERNS,
} from "../theory.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

const FOUR_CHORD_LIFT = ["I", "V", "IV", "V"];

function renderRomanSequence(symbols, mode) {
  return symbols.map((symbol) => {
    const parsed = parseRomanSymbol(symbol);
    const tag = getChordTagForSymbol(symbol, {
      mode,
      parsed,
      preferModeQuality: true,
    });
    return labelRomanWithTag(symbol, tag, parsed);
  });
}

function run() {
  describe("Roman numeral relabeling", () => {
    it("keeps Pop Lift uppercase in major", () => {
      const labeled = renderRomanSequence(FOUR_CHORD_LIFT, "major");
      expect(JSON.stringify(labeled), `Unexpected labels in major: ${labeled.join(" ")}`).toBe(
        JSON.stringify(["I", "V", "IV", "V"]),
      );
    });

    it("adapts Four-Chord Lift to minor", () => {
      const labeled = renderRomanSequence(FOUR_CHORD_LIFT, "minor");
      expect(JSON.stringify(labeled), `Unexpected labels in minor: ${labeled.join(" ")}`).toBe(
        JSON.stringify(["i", "v", "iv", "v"]),
      );
    });

    it("applies harmonic minor qualities", () => {
      const labeled = renderRomanSequence(FOUR_CHORD_LIFT, "harmonicMinor");
      expect(JSON.stringify(labeled), `Unexpected labels in harmonic minor: ${labeled.join(" ")}`).toBe(
        JSON.stringify(["i", "V", "iv", "V"]),
      );
    });

    it("respects explicit extensions", () => {
      const symbol = "Imaj7";
      const parsed = parseRomanSymbol(symbol);
      const tag = getChordTagForSymbol(symbol, {
        mode: "minor",
        parsed,
        preferModeQuality: true,
      });
      const labeled = labelRomanWithTag(symbol, tag, parsed);
      expect(labeled, `Expected explicit extension to remain, got ${labeled}`).toBe("Imaj7");
    });

    it("flags borrowed chromatic chords for transparency", () => {
      const analysis = analyzeRomanAgainstMode("bVII", "major");
      expect(analysis.isDiatonic, "bVII should be marked non-diatonic in major").toBe(false);
      expect(analysis.reasonCode, `Unexpected reason ${analysis.reasonCode}`).toBe("accidental");
    });
  });

  describe("Altered numerals are measured from the major scale", () => {
    const chord = (symbol, key, mode) => {
      const built = buildChord(symbol, key, { mode }, { mode });
      return `${built.root} ${built.quality}`;
    };

    it("builds bVII, bVI and bIII in minor a whole step, major third and minor third from home", () => {
      expect(["i", "bVII", "bVI", "bIII"].map((symbol) => chord(symbol, "A", "minor"))).toEqual([
        "A min",
        "G maj",
        "F maj",
        "C maj",
      ]);
      expect(chord("bVII7", "C", "minor")).toBe("Bb dom7");
    });

    it("builds the same bVII in every mode, and never diminished", () => {
      for (const mode of Object.keys(SCALE_PATTERNS)) {
        expect(chord("bVII", "C", mode), mode).toBe("Bb maj");
      }
    });

    it("spells a lowered degree from the key, not from the flat sign", () => {
      expect(["bVII", "bVI", "V/bVII"].map((symbol) => chord(symbol, "G#", "minor"))).toEqual([
        "F# maj",
        "E maj",
        "C# dom7",
      ]);
      expect(["bVII", "bIII", "bVI"].map((symbol) => chord(symbol, "D", "major"))).toEqual([
        "C maj",
        "F maj",
        "Bb maj",
      ]);
    });

    it("leaves plain numerals on the mode's own degrees", () => {
      expect(["VI", "III", "VII"].map((symbol) => chord(symbol, "A", "minor"))).toEqual([
        "F maj",
        "C maj",
        "G maj",
      ]);
      expect(chord("V", "A", "harmonicMinor")).toBe("E maj");
    });

    it("aims an applied dominant at an altered target the same way", () => {
      expect(chord("V/bVII", "A", "minor")).toBe("D dom7");
      expect(chord("V/bVI", "C", "major")).toBe("Eb dom7");
    });

    it("calls minor's own seventh, sixth and third chords diatonic, and real borrowings borrowed", () => {
      for (const symbol of ["bVII", "bVI", "bIII"]) {
        expect(analyzeRomanAgainstMode(symbol, "minor").isDiatonic, symbol).toBe(true);
      }
      expect(analyzeRomanAgainstMode("bII", "minor").reasonCode).toBe("accidental");
      expect(analyzeRomanAgainstMode("bvii", "minor").reasonCode).toBe("accidental");
      expect(analyzeRomanAgainstMode("bIII", "harmonicMinor").reasonCode).toBe("accidental");
    });
  });
}

run();
