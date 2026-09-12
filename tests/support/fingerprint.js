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

/** The same 96-seed matrix used by tests/assignment.spec.js. */
export const PROPERTY_SEED_COUNT = 96;

export function propertySeeds(count = PROPERTY_SEED_COUNT) {
  return Array.from({ length: count }, (_, index) => `property-${index}`);
}

export function assignmentForSeed(seed) {
  return generateAssignment(rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed }));
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
export function fingerprintMatrix(seeds = propertySeeds()) {
  return Object.fromEntries(seeds.map((seed) => [seed, fingerprint(assignmentForSeed(seed))]));
}
