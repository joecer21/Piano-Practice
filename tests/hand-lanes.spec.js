import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSIGNMENT_INPUTS,
  generateAssignment,
  generateLearnerAssignment,
  normalizeAssignmentInputs,
  rerollAssignmentInputs,
} from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { HAND_CLEARANCE, KEYBOARD_FLOOR, planHandLanes } from "../engine.js";
import { PRESET_CONFIGS } from "../presets.js";
import { LEFT_HAND_PATTERN_METADATA, MOTIF_STYLES, isMotifOfferedInMode } from "../theory.js";
import { handGeometry } from "./support/hand-geometry.js";

function presetInputs(preset) {
  return normalizeAssignmentInputs({
    ...DEFAULT_ASSIGNMENT_INPUTS,
    key: preset.key,
    mode: preset.mode,
    progressionPresetId: preset.progressionPresetId,
    styleId: preset.styleId,
    length: preset.length,
    lhId: preset.lhId,
    motifId: preset.motifId,
    presetId: preset.id,
    customProgressionRoman: [],
  });
}

/** Every rule a learner can see on the keyboard: own zones, one hand position, on the keys. */
function expectHandsInLanes(assignment, label) {
  const geometry = handGeometry(buildScore(assignment));
  if (geometry.rhRange) {
    expect(geometry.clashes, `${label}: hands share or cross keys`).toBe(0);
    expect(
      geometry.rhRange[0] - geometry.lhRange[1],
      `${label}: left hand reaches the tune (LH top ${geometry.lhRange[1]}, RH low ${geometry.rhRange[0]})`,
    ).toBeGreaterThanOrEqual(HAND_CLEARANCE);
    expect(geometry.shapeOverlap, `${label}: the drawn chord shape reaches the tune`).toBe(0);
  }
  expect(geometry.belowA1, `${label}: left hand below A1`).toBe(0);
  expect(geometry.maxBassLeap, `${label}: bass leaps more than an octave`).toBeLessThanOrEqual(11);
  expect(geometry.movedRepeatChords, `${label}: a repeated chord moved`).toBe(0);
  expect(geometry.lhSpan, `${label}: left hand spreads too wide`).toBeLessThanOrEqual(24);
  return geometry;
}

describe("hand lanes", () => {
  it("keeps every preset's hands in their own lanes", () => {
    for (const preset of PRESET_CONFIGS) {
      const geometry = expectHandsInLanes(generateLearnerAssignment(presetInputs(preset)), preset.id);
      // The bass lane is fitted to each progression, so a preset's bass never leaps past a fifth.
      expect(geometry.maxBassLeap, `${preset.id}: bass leaps more than a fifth`).toBeLessThanOrEqual(7);
    }
  });

  it("holds across rerolled assignments", () => {
    for (let index = 0; index < 400; index += 1) {
      const inputs = rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: `lanes-${index}` });
      expectHandsInLanes(generateAssignment(inputs), `seed lanes-${index}`);
    }
  });

  it("holds for every left hand under every tune, in a low and a high key", () => {
    for (const key of ["E", "A#"]) {
      for (const mode of ["major", "minorBlues"]) {
        for (const lhId of Object.keys(LEFT_HAND_PATTERN_METADATA)) {
          for (const motifId of Object.keys(MOTIF_STYLES).filter((id) => isMotifOfferedInMode(id, mode))) {
            const inputs = { ...DEFAULT_ASSIGNMENT_INPUTS, key, mode, lhId, motifId, presetId: null };
            expectHandsInLanes(generateAssignment(inputs), `${key} ${mode} ${lhId} under ${motifId}`);
          }
        }
      }
    }
  });
});

describe("planHandLanes", () => {
  it("sits at the pattern's home when there is no tune", () => {
    expect(planHandLanes({ leftHandPatternId: "oompah" })).toMatchObject({
      home: 40,
      chordLow: 50,
      ceiling: 63,
      melodyShift: 0,
    });
  });

  it("stops the hand short of a high tune without following it up", () => {
    const lanes = planHandLanes({ leftHandPatternId: "oompah", melody: { min: 72, max: 79 } });
    expect(lanes).toMatchObject({ home: 40, ceiling: 63, melodyShift: 0 });
  });

  it("drops the lanes a little for a tune just above them", () => {
    const lanes = planHandLanes({ leftHandPatternId: "oompah", melody: { min: 60, max: 67 } });
    expect(lanes).toMatchObject({ home: 39, ceiling: 58, melodyShift: 0 });
  });

  it("lifts a low tune an octave for the whole piece rather than burying the left hand", () => {
    const lanes = planHandLanes({ leftHandPatternId: "root-5th-oct", melody: { min: 57, max: 63 } });
    expect(lanes).toMatchObject({ home: 40, melodyShift: 12 });
    expect(69 - lanes.ceiling).toBeGreaterThanOrEqual(HAND_CLEARANCE);
  });

  it("never drops below A1 when the tune cannot be lifted", () => {
    const lanes = planHandLanes({ leftHandPatternId: "oompah", melody: { min: 48, max: 84 } });
    expect(lanes.melodyShift).toBe(0);
    expect(lanes.home).toBe(KEYBOARD_FLOOR);
    expect(lanes.ceiling).toBe(48 - HAND_CLEARANCE);
  });
});
