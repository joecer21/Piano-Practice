import {
  generateScale,
  generateProgression,
  generateLeftHandPattern,
  generateMotif,
  createPhrasePlan,
} from "../engine.js";
import { HAND_RANGE_SPECS, noteStringToMidi } from "../theory.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

function collectMidisFromSteps(steps = []) {
  const values = [];
  steps.forEach((step) => {
    if (!step || step.rest) return;
    if (Array.isArray(step.notes) && step.notes.length) {
      step.notes.forEach((note) => {
        if (note) values.push(noteStringToMidi(note));
      });
    } else if (step.note) {
      values.push(noteStringToMidi(step.note));
    }
  });
  return values;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function run() {
  describe("Range-aware phrase planning", () => {
    it("Pop 4 in A minor keeps LH in its home lanes and RH near C5", () => {
      const scale = generateScale({ key: "A", mode: "minor" });
      const progression = generateProgression(
        { key: "A", mode: "minor", length: 4, progressionPresetId: "pop-4" },
        scale,
      );
      const phrasePlan = createPhrasePlan({
        key: "A",
        mode: "minor",
        styleId: "pop",
        motifPatternId: "pop-hook-1351",
        leftHandPatternId: "pop-8ths",
      });
      const leftHand = generateLeftHandPattern(
        {
          leftHand: "pop-8ths",
          difficulty: "intermediate",
          styleId: "pop",
          phrasePlan,
        },
        progression,
        "minor",
      );
      const lhMidis = leftHand.bars.flatMap((bar) => collectMidisFromSteps(bar.steps));
      const minLh = Math.min(...lhMidis);
      const maxLh = Math.max(...lhMidis);
      // With no tune above it, the hand stays in its home lanes (bass from E2, slid at most
      // four keys to suit the progression) and nothing above D#4.
      expect(minLh, `Left hand dropped below its bass lane: ${minLh}`).toBeGreaterThanOrEqual(
        noteStringToMidi("C2"),
      );
      expect(maxLh, `Left hand exceeded its lanes: ${maxLh}`).toBeLessThanOrEqual(noteStringToMidi("D#4"));

      const motif = generateMotif({ motifPatternId: "pop-hook-1351", styleId: "pop", phrasePlan }, scale);
      const motifMidis = collectMidisFromSteps(motif.steps);
      const avgMid = average(motifMidis);
      expect(
        Math.abs(avgMid - noteStringToMidi("C5")),
        `Motif center drifted too far from C5 (avg ${avgMid})`,
      ).toBeLessThanOrEqual(6);
    });

    it("Arch contour motif stays in RH comfort and peaks once", () => {
      const scale = generateScale({ key: "C", mode: "major" });
      const phrasePlan = createPhrasePlan({
        key: "C",
        mode: "major",
        styleId: "classical",
        motifPatternId: "step-arch",
        leftHandPatternId: "alberti",
      });
      const motif = generateMotif({ motifPatternId: "step-arch", styleId: "classical", phrasePlan }, scale);
      const motifMidis = collectMidisFromSteps(motif.steps);
      const rhComfort = HAND_RANGE_SPECS.rh.comfort;
      const minMidi = Math.min(...motifMidis);
      const maxMidi = Math.max(...motifMidis);
      expect(minMidi, `Motif dipped below RH comfort: ${minMidi}`).toBeGreaterThanOrEqual(
        noteStringToMidi(rhComfort.low),
      );
      expect(maxMidi, `Motif exceeded RH comfort: ${maxMidi}`).toBeLessThanOrEqual(
        noteStringToMidi(rhComfort.high),
      );
      const peakThreshold = noteStringToMidi(rhComfort.high) - 1;
      const peaks = motifMidis.filter((midi) => midi >= peakThreshold).length;
      expect(peaks, `Expected one expressive peak, saw ${peaks}`).toBe(1);
    });
  });
}

run();
