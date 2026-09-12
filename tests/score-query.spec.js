import { describe, expect, it } from "vitest";
import { describeAssignment, describeChordFunction, describeMotif } from "../domain/describe.ts";
import {
  activeChordAt,
  barBeatRange,
  classifyPitch,
  eventsForPart,
  eventsStartingInBar,
} from "../domain/score-query.ts";
import { buildScore } from "../domain/score.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { assignmentForSeed } from "./support/fingerprint.js";

function setup() {
  const assignment = generateAssignment(DEFAULT_ASSIGNMENT_INPUTS);
  return { assignment, score: buildScore(assignment) };
}

describe("Score queries", () => {
  it("uses half-open bar ranges and onset-based filtering", () => {
    const { score } = setup();
    expect(barBeatRange(score, 0)).toEqual([0, 4]);
    expect(barBeatRange(score, 1)).toEqual([4, 8]);
    expect(activeChordAt(score, 3.999)?.barIndex).toBe(0);
    expect(activeChordAt(score, 4)?.barIndex).toBe(1);
    expect(activeChordAt(score, score.meta.totalBeats)).toBeNull();

    const barOne = eventsStartingInBar(score, 0);
    expect(barOne.length).toBeGreaterThan(0);
    expect(barOne.every((event) => event.startBeat >= 0 && event.startBeat < 4)).toBe(true);
    expect(eventsForPart(score, "lh", [4, 8]).every((event) => event.part === "lh")).toBe(true);
    expect(() => barBeatRange(score, score.meta.bars)).toThrow(RangeError);
    expect(() => eventsForPart(score, "rh", [8, 4])).toThrow(RangeError);
  });

  it("classifies root, chord, scale, and chromatic pitches against the active bar", () => {
    const { score } = setup();
    expect(classifyPitch(score, 60, 0)).toMatchObject({ role: "root", degree: { number: 1 } });
    expect(classifyPitch(score, 64, 0)).toMatchObject({ role: "chordTone", degree: { number: 3 } });
    expect(classifyPitch(score, 62, 0)).toMatchObject({ role: "scaleTone", degree: { number: 2 } });
    expect(classifyPitch(score, 63, 0)).toMatchObject({
      role: "chromatic",
      degree: { number: 3, alteration: -1 },
    });
  });
});

describe("Score descriptions", () => {
  it("condenses repeating material into the coach summary", () => {
    const { assignment, score } = setup();
    expect(describeMotif(score)).toBe("1 → 3 → 5 → 1, climbs and lands");
    expect(describeAssignment(score, assignment)).toBe(
      "C major. I–V–vi–IV. Pop 8ths (Root/Octave) underneath, 1 → 3 → 5 → 1, climbs and lands on top.",
    );
    expect(describeChordFunction(score.bars[0], score)).toBe("I — home. Every phrase can land here.");
    expect(describeChordFunction(score.bars[1], score)).toBe("V — the strongest pull back to home.");
  });

  it("describes one motif cycle even when the score ends partway through a later repeat", () => {
    const assignment = Array.from({ length: 96 }, (_, index) => assignmentForSeed(`property-${index}`)).find(
      (candidate) => candidate.motif?.totalBeats === 6 || candidate.motif?.totalBeats === 7,
    );
    expect(assignment).toBeTruthy();
    const score = buildScore(assignment);
    const sourceNoteCount = assignment.motif.steps.filter((step) => !step.rest).length;
    const scheduledNoteCount = score.parts.rh.filter((event) => event.kind === "note").length;
    const describedNoteCount = describeMotif(score).split(", ")[0].split(" → ").length;

    expect(scheduledNoteCount).toBeGreaterThan(sourceNoteCount);
    expect(describedNoteCount).toBeLessThanOrEqual(sourceNoteCount);
  });
});
