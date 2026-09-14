import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import {
  DEFAULT_ASSIGNMENT_INPUTS,
  generateAssignment,
  normalizeAssignmentInputs,
  rerollAssignmentInputs,
} from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { PRESET_CONFIGS } from "../presets.js";
import { handGeometry } from "./support/hand-geometry.js";

// Writes a hand-geometry report when HAND_GEOMETRY_OUT names a file; otherwise skipped.
const out = process.env.HAND_GEOMETRY_OUT;

describe.skipIf(!out)("hand geometry report", () => {
  it("measures presets and the seeded matrix", () => {
    const rows = [];
    for (const preset of PRESET_CONFIGS) {
      const inputs = normalizeAssignmentInputs({
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
      rows.push({
        id: `preset:${preset.id}`,
        inputs,
        ...handGeometry(buildScore(generateAssignment(inputs))),
      });
    }
    for (let index = 0; index < 96; index += 1) {
      const inputs = rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: `property-${index}` });
      rows.push({ id: `seed:${index}`, inputs, ...handGeometry(buildScore(generateAssignment(inputs))) });
    }
    writeFileSync(out, JSON.stringify(rows, null, 1));
  });
});
