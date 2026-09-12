import {
  parseRomanSymbol,
  getChordTagForSymbol,
  labelRomanWithTag,
  analyzeRomanAgainstMode,
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
}

run();
