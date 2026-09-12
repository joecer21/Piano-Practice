import {
  parseRomanSymbol,
  getChordTagForSymbol,
  labelRomanWithTag,
  analyzeRomanAgainstMode,
} from "../theory.js";
import { describe, it } from "vitest";
import { expectContract as expect } from "./test-helpers.js";

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
      expect(
        JSON.stringify(labeled) === JSON.stringify(["I", "V", "IV", "V"]),
        `Unexpected labels in major: ${labeled.join(" ")}`
      );
    });

    it("adapts Four-Chord Lift to minor", () => {
      const labeled = renderRomanSequence(FOUR_CHORD_LIFT, "minor");
      expect(
        JSON.stringify(labeled) === JSON.stringify(["i", "v", "iv", "v"]),
        `Unexpected labels in minor: ${labeled.join(" ")}`
      );
    });

    it("applies harmonic minor qualities", () => {
      const labeled = renderRomanSequence(FOUR_CHORD_LIFT, "harmonicMinor");
      expect(
        JSON.stringify(labeled) === JSON.stringify(["i", "V", "iv", "V"]),
        `Unexpected labels in harmonic minor: ${labeled.join(" ")}`
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
      expect(labeled === "Imaj7", `Expected explicit extension to remain, got ${labeled}`);
    });

    it("flags borrowed chromatic chords for transparency", () => {
      const analysis = analyzeRomanAgainstMode("bVII", "major");
      expect(analysis.isDiatonic === false, "bVII should be marked non-diatonic in major");
      expect(analysis.reasonCode === "accidental", `Unexpected reason ${analysis.reasonCode}`);
    });
  });
}

run();
