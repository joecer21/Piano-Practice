import { describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { DEGREE_REFERENCE_SIZE, degreeForInterval } from "../domain/degree.ts";
import { formatDegreeToken } from "../domain/describe.ts";
import { buildScore } from "../domain/score.ts";
import { classifyPitch } from "../domain/score-query.ts";
import { SCALE_PATTERNS } from "../theory.js";
import { assignmentForSeed, propertySeeds } from "./support/fingerprint.js";

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const label = (semitones, intervals) => formatDegreeToken(degreeForInterval(semitones, intervals));
const semitoneOf = (degree) => (((MAJOR_STEPS[degree.number - 1] + degree.alteration) % 12) + 12) % 12;
const scoreIn = (mode, key = "C") =>
  buildScore(generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, key, mode, seed: `degree-${mode}` }));

describe("degreeForInterval", () => {
  it("names every semitone against the major scale", () => {
    const major = SCALE_PATTERNS.major.intervals;
    expect(Array.from({ length: 12 }, (_, semitone) => label(semitone, major))).toEqual([
      "1",
      "♭2",
      "2",
      "♭3",
      "3",
      "4",
      "♯4",
      "5",
      "♭6",
      "6",
      "♭7",
      "7",
    ]);
  });

  it("spells the tritone as the blue note ♭5 only where the mode contains it", () => {
    expect(label(6, SCALE_PATTERNS.minorBlues.intervals)).toBe("♭5");
    expect(label(6, SCALE_PATTERNS.major.intervals)).toBe("♯4");
  });

  it("spells extensions against seven degrees in every mode", () => {
    const token = degreeForInterval(2, SCALE_PATTERNS.pentatonicMinor.intervals, 1);
    expect(token.scaleSize).toBe(DEGREE_REFERENCE_SIZE);
    expect(formatDegreeToken(token)).toBe("9");
  });
});

describe("degrees in each mode read the way musicians say them", () => {
  // Previously degrees counted positions within the mode's own scale, so the minor
  // third was "3" in natural minor and "2" in minor pentatonic.
  const scaleLabels = (mode) => {
    const score = scoreIn(mode);
    return score.meta.scalePitchClasses.map((pc) =>
      formatDegreeToken(classifyPitch(score, 60 + pc, 0).degree),
    );
  };

  it.each([
    ["major", ["1", "2", "3", "4", "5", "6", "7"]],
    ["minor", ["1", "2", "♭3", "4", "5", "♭6", "♭7"]],
    ["harmonicMinor", ["1", "2", "♭3", "4", "5", "♭6", "7"]],
    ["melodicMinor", ["1", "2", "♭3", "4", "5", "6", "7"]],
    ["pentatonicMajor", ["1", "2", "3", "5", "6"]],
    ["pentatonicMinor", ["1", "♭3", "4", "5", "♭7"]],
    ["majorBlues", ["1", "2", "♭3", "3", "5", "6"]],
    ["minorBlues", ["1", "♭3", "4", "♭5", "5", "♭7"]],
  ])("%s", (mode, expected) => {
    expect(scaleLabels(mode)).toEqual(expected);
  });

  it("is independent of the key", () => {
    const score = scoreIn("pentatonicMinor", "A#");
    // C# is the minor third of A#.
    expect(formatDegreeToken(classifyPitch(score, 61, 0).degree)).toBe("♭3");
  });
});

describe("every degree in every generated score names its note's pitch", () => {
  it("holds across the 96-seed matrix for both hands", () => {
    for (const seed of propertySeeds()) {
      const score = buildScore(assignmentForSeed(seed));
      for (const event of [...score.parts.lh, ...score.parts.rh]) {
        if (event.kind !== "note" || !event.degree) continue;
        const expected = (((event.midi - score.meta.rootPitchClass) % 12) + 12) % 12;
        expect(semitoneOf(event.degree), `${seed} ${event.id} midi ${event.midi}`).toBe(expected);
        expect(event.degree.scaleSize, `${seed} ${event.id}`).toBe(DEGREE_REFERENCE_SIZE);
      }
    }
  });
});
