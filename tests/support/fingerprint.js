// Musical fingerprint: a stable hash over musical FACTS only.
//
// Purpose: detect unintended changes to generated music during refactoring.
// It deliberately excludes presentation text (labels, descriptions, style prose),
// the assignment id (which is derived from inputs, not notes, and therefore cannot
// detect a change in generated material), and object property order.
//
// `duration` (Tone notation such as "8n") is captured ALONGSIDE numeric `beats`
// while both exist in the domain. The B3 defect lives in the derived Tone string,
// not in `beats`, so a beats-only fingerprint would be blind to it. Once beats are
// canonical and Tone notation is produced only at schedule time, drop `dur`.

import { createHash } from "node:crypto";
import {
  DEFAULT_ASSIGNMENT_INPUTS,
  generateAssignment,
  rerollAssignmentInputs,
} from "../../domain/assignment.js";
import { SCALE_PATTERNS } from "../../theory.js";

/** The same 96-seed matrix used by tests/assignment.spec.js. */
export const PROPERTY_SEED_COUNT = 96;

export function propertySeeds(count = PROPERTY_SEED_COUNT) {
  return Array.from({ length: count }, (_, index) => `property-${index}`);
}

export function assignmentForSeed(seed) {
  return generateAssignment(rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed }));
}

/**
 * Every property seed rerolls away from the defaults with pickDifferent, so the
 * 96-seed matrix never contains the default mode (major) or the default key (C).
 * A fixed grid of every mode in a natural, a sharp and a flat-spelled key closes
 * that hole without changing any property seed.
 */
export const COVERAGE_KEYS = Object.freeze(["C", "F#", "A#"]);

export function coverageCaseIds() {
  return Object.keys(SCALE_PATTERNS).flatMap((mode) => COVERAGE_KEYS.map((key) => `coverage:${mode}:${key}`));
}

/** All fingerprinted cases: the property seeds, then the mode-by-key coverage grid. */
export function fingerprintCaseIds() {
  return [...propertySeeds(), ...coverageCaseIds()];
}

export function assignmentForCase(caseId) {
  if (!caseId.startsWith("coverage:")) return assignmentForSeed(caseId);
  const [, mode, key] = caseId.split(":");
  return generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, key, mode, seed: caseId });
}

function stepNotes(step) {
  if (Array.isArray(step?.notes)) return [...step.notes];
  if (step?.note) return [step.note];
  return [];
}

/** Musical facts of one assignment, as a plain JSON-safe object. */
export function musicalFacts(assignment) {
  const { inputs, scale, progression, leftHand, motif } = assignment;
  return {
    inputs: {
      key: inputs.key,
      mode: inputs.mode,
      progressionPresetId: inputs.progressionPresetId,
      styleId: inputs.styleId,
      length: inputs.length,
      lhId: inputs.lhId,
      motifId: inputs.motifId,
      customProgressionRoman: [...inputs.customProgressionRoman],
    },
    scale: { root: scale.root, mode: scale.mode, notes: [...scale.notes], intervals: [...scale.intervals] },
    bars: progression.bars.map((bar, barIndex) => ({
      barIndex,
      symbol: bar.symbol,
      quality: bar.quality,
      root: bar.root,
      isDiatonic: bar.isDiatonic,
      diatonicReason: bar.diatonicReason ?? null,
      chordNotes: [...bar.chordNotes],
      bassNotes: [...bar.bassNotes],
    })),
    lh: leftHand.bars.flatMap((bar, barIndex) =>
      bar.steps.map((step) => ({
        barIndex,
        time: step.time,
        beats: step.beats,
        dur: step.duration,
        notes: stepNotes(step),
      })),
    ),
    rh: (motif?.steps || []).map((step) => ({
      time: step.time,
      beats: step.beats,
      dur: step.duration,
      rest: Boolean(step.rest),
      notes: stepNotes(step),
      degree: step.degree ?? null,
    })),
    rhTotalBeats: motif?.totalBeats ?? null,
  };
}

/** Deterministic serialization: keys sorted at every level. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function fingerprint(assignment) {
  return createHash("sha256")
    .update(stableStringify(musicalFacts(assignment)))
    .digest("hex")
    .slice(0, 16);
}

/** { seed: hash } for the whole matrix. */
export function fingerprintMatrix(caseIds = fingerprintCaseIds()) {
  return Object.fromEntries(caseIds.map((caseId) => [caseId, fingerprint(assignmentForCase(caseId))]));
}

/**
 * Every leaf that differs between two fact trees, with array positions collapsed
 * so the same kind of change reads as one path ("parts.rh[].degree.number").
 */
export function changedFieldPaths(before, after, path = "") {
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    const paths = a.length === b.length ? [] : [`${path}.length`];
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      paths.push(...changedFieldPaths(a[index], b[index], `${path}[]`));
    }
    return paths;
  }
  const isObject = (value) => value !== null && typeof value === "object";
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) =>
      changedFieldPaths(before[key], after[key], path ? `${path}.${key}` : key),
    );
  }
  return stableStringify(before) === stableStringify(after) ? [] : [path || "(root)"];
}
