import { createPhrasePlan } from "../engine.js";
import { noteStringToMidi } from "../theory.js";
import { describe, it } from "vitest";
import { expectContract as expect } from "./test-helpers.js";

const FIXTURES = [
  {
    label: "Pop C major preset keeps RH at C4 and LH at A2",
    input: {
      key: "C",
      mode: "major",
      styleId: "pop",
      motifPatternId: "pop-hook-1351",
      leftHandPatternId: "pop-8ths",
    },
    expected: { rh: "C4", lh: "A2", gap: 15 },
  },
  {
    label: "Jazz Bb ii–V–I centers RH at A#4 with LH fifteen semitones below",
    input: {
      key: "A#",
      mode: "major",
      styleId: "jazz",
      motifPatternId: "swing-lick-3579",
      leftHandPatternId: "walking",
    },
    expected: { rh: "A#4", lh: "F3", gap: 17 },
  },
  {
    label: "E harmonic minor dramatic preset spreads RH/LH by over two octaves",
    input: {
      key: "E",
      mode: "harmonicMinor",
      styleId: "classical",
      motifPatternId: "harmonic-rise",
      leftHandPatternId: "oompah",
    },
    expected: { rh: "E5", lh: "D#3", gap: 25 },
  },
  {
    label: "Minor blues in A keeps shell voicings grounded but clear of the motif",
    input: {
      key: "A",
      mode: "minorBlues",
      styleId: "jazz",
      motifPatternId: "blues-riff",
      leftHandPatternId: "root-5th-oct",
    },
    expected: { rh: "A4", lh: "G3", gap: 14 },
  },
  {
    label: "Modal vamp in G lifts the pedal LH register when the RH sits low",
    input: {
      key: "G",
      mode: "minor",
      styleId: "modal",
      motifPatternId: "modal-pedal",
      leftHandPatternId: "pedal",
    },
    expected: { rh: "G4", lh: "G#2", gap: 23 },
  },
  {
    label: "Stride in Db major keeps the LH a wide octave below the bebop lick",
    input: {
      key: "Db",
      mode: "major",
      styleId: "jazz",
      motifPatternId: "swing-lick-3579",
      leftHandPatternId: "stride",
    },
    expected: { rh: "C#5", lh: "G3", gap: 18 },
  },
  {
    label: "Power 8ths in F# minor stay elevated when the pop motif sits low",
    input: {
      key: "F#",
      mode: "minor",
      styleId: "pop",
      motifPatternId: "pop-offbeat-echo",
      leftHandPatternId: "power-8ths",
    },
    expected: { rh: "F#4", lh: "D#3", gap: 15 },
  },
  {
    label: "Ab minor pedal preset keeps LH above the muddy floor",
    input: {
      key: "Ab",
      mode: "minor",
      styleId: "modal",
      motifPatternId: "modal-pedal",
      leftHandPatternId: "pedal",
    },
    expected: { rh: "G#4", lh: "A2", gap: 23 },
  },
];

function run() {
  describe("Preset anchor spacing", () => {
    FIXTURES.forEach((fixture) => {
      it(fixture.label, () => {
        const plan = createPhrasePlan(fixture.input);
        expect(
          plan.rh.anchorNote === fixture.expected.rh,
          `Expected RH anchor ${fixture.expected.rh}, got ${plan.rh.anchorNote}`,
        );
        expect(
          plan.lh.anchorNote === fixture.expected.lh,
          `Expected LH anchor ${fixture.expected.lh}, got ${plan.lh.anchorNote}`,
        );
        const gap = noteStringToMidi(plan.rh.anchorNote) - noteStringToMidi(plan.lh.anchorNote);
        expect(
          gap === fixture.expected.gap,
          `Expected LH/RH midi gap ${fixture.expected.gap}, observed ${gap}`,
        );
      });
    });
  });
}

run();
