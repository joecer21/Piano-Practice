import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSIGNMENT_INPUTS,
  generateAssignment,
  normalizeAssignmentInputs,
  rerollAssignmentInputs,
  validateAssignment,
  validateAssignmentInputs,
} from "../domain/assignment.js";
import { HAND_RANGE_SPECS, noteStringToMidi } from "../theory.js";

function collectNotes(steps = []) {
  return steps.flatMap((step) => step?.notes || (step?.note ? [step.note] : []));
}

function expectStepsInRange(steps, range) {
  const low = noteStringToMidi(range.low);
  const high = noteStringToMidi(range.high);
  collectNotes(steps).forEach((note) => {
    const midi = noteStringToMidi(note);
    expect(Number.isFinite(midi), `${note} should be a valid MIDI note`).toBe(true);
    expect(midi, `${note} should stay above ${range.low}`).toBeGreaterThanOrEqual(low);
    expect(midi, `${note} should stay below ${range.high}`).toBeLessThanOrEqual(high);
  });
}

describe("Assignment schema", () => {
  it("normalizes and rejects invalid external inputs", () => {
    const normalized = normalizeAssignmentInputs({ length: "8", seed: 42 });
    expect(normalized.length).toBe(8);
    expect(normalized.seed).toBe("42");

    const invalid = validateAssignmentInputs({ ...normalized, mode: "super-locrian-ish" });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain("unknown mode: super-locrian-ish");
  });

  it("produces a stable ID and identical music for the same input and seed", () => {
    const first = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, seed: "repeatable-17" });
    const second = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, seed: "repeatable-17" });

    expect(second.id).toBe(first.id);
    expect(second.progression).toEqual(first.progression);
    expect(second.leftHand).toEqual(first.leftHand);
    expect(second.motif).toEqual(first.motif);
    expect(validateAssignment(first)).toEqual({ valid: true, errors: [] });
    expect(validateAssignment(JSON.parse(JSON.stringify(first)))).toEqual({ valid: true, errors: [] });
  });
});

describe("Seeded assignment properties", () => {
  it("rerolls reproducibly and changes every unlocked component", () => {
    const first = rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: "same-seed" });
    const second = rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: "same-seed" });
    expect(second).toEqual(first);
    expect(first.key).not.toBe(DEFAULT_ASSIGNMENT_INPUTS.key);
    expect(first.progressionPresetId).not.toBe(DEFAULT_ASSIGNMENT_INPUTS.progressionPresetId);
    expect(first.lhId).not.toBe(DEFAULT_ASSIGNMENT_INPUTS.lhId);
    expect(first.motifId).not.toBe(DEFAULT_ASSIGNMENT_INPUTS.motifId);
  });

  it("maintains musical invariants across a seeded input matrix", () => {
    for (let index = 0; index < 96; index += 1) {
      const inputs = rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: `property-${index}` });
      const assignment = generateAssignment(inputs);
      const validation = validateAssignment(assignment);
      expect(validation.errors, `seed ${inputs.seed}`).toEqual([]);
      expect(assignment.progression.bars).toHaveLength(assignment.progression.roman.length);
      expect(assignment.leftHand.bars).toHaveLength(assignment.progression.bars.length);

      assignment.leftHand.bars.forEach((bar, barIndex) => {
        expect(bar.steps.length).toBeGreaterThan(0);
        bar.steps.forEach((step) => {
          expect(step.time).toBeGreaterThanOrEqual(barIndex * 4);
          expect(step.time).toBeLessThan((barIndex + 1) * 4);
          expect(step.beats).toBeGreaterThan(0);
        });
        expectStepsInRange(bar.steps, HAND_RANGE_SPECS.lh.soft);
      });

      if (assignment.motif) {
        expect(assignment.motif.totalBeats).toBeGreaterThan(0);
        expectStepsInRange(assignment.motif.steps, HAND_RANGE_SPECS.rh.soft);
      }
    }
  });
});
