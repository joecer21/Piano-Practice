import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSIGNMENT_INPUTS,
  MotifNotOfferedError,
  checkMotifOffer,
  generateAssignment,
  generateLearnerAssignment,
  rerollAssignmentInputs,
} from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { formatDegreeToken } from "../domain/describe.ts";
import { PRESET_CONFIGS } from "../presets.js";

const fromPreset = (preset) => ({
  ...DEFAULT_ASSIGNMENT_INPUTS,
  key: preset.key,
  mode: preset.mode,
  progressionPresetId: preset.progressionPresetId,
  lhId: preset.lhId,
  motifId: preset.motifId,
  length: preset.length,
  styleId: preset.styleId,
  presetId: preset.id,
});

describe("learner-facing generation", () => {
  it("refuses a motif the mode does not offer, with the reason and variant, and never changes it", () => {
    const inputs = { ...DEFAULT_ASSIGNMENT_INPUTS, mode: "majorBlues", motifId: "funk-sync" };
    let thrown;
    try {
      generateLearnerAssignment(inputs);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MotifNotOfferedError);
    expect(thrown.reason).toBe(checkMotifOffer(inputs).reason);
    expect(thrown.variant).toBe("funk-sync-6");
    expect(inputs.motifId).toBe("funk-sync");

    // The unrestricted path still generates it, for analysis.
    expect(generateAssignment(inputs).inputs.motifId).toBe("funk-sync");
  });

  it("generates the same assignment as the unrestricted path when the motif is offered", () => {
    const inputs = { ...DEFAULT_ASSIGNMENT_INPUTS, mode: "majorBlues", motifId: "funk-sync-6" };
    expect(generateLearnerAssignment(inputs)).toEqual(generateAssignment(inputs));
  });

  it("accepts every preset and every reroll a learner can reach", () => {
    for (const preset of PRESET_CONFIGS) {
      expect(() => generateLearnerAssignment(fromPreset(preset)), preset.id).not.toThrow();
    }
    let inputs = { ...DEFAULT_ASSIGNMENT_INPUTS };
    for (let index = 0; index < 200; index += 1) {
      inputs = rerollAssignmentInputs(inputs, { seed: `learner-${index}` });
      expect(() => generateLearnerAssignment(inputs), `${inputs.motifId} in ${inputs.mode}`).not.toThrow();
    }
  });

  it("is enforced by lint: product code cannot import the unrestricted generator", async () => {
    const eslint = new ESLint();
    const productSurfaces = [
      { filePath: "main.js", importPath: "./domain/assignment.js" },
      { filePath: "application/app-controller.js", importPath: "../domain/assignment.js" },
      { filePath: "components/piano-interactions.js", importPath: "../domain/assignment.js" },
    ];
    for (const { filePath, importPath } of productSurfaces) {
      const source = `import { generateAssignment } from "${importPath}";\ngenerateAssignment({});\n`;
      const [result] = await eslint.lintText(source, { filePath });
      expect(
        result.messages.map((message) => message.ruleId),
        filePath,
      ).toContain("no-restricted-imports");
    }
    const [coach] = await eslint.lintText(
      'import { generateAssignment } from "../domain/assignment.js";\ngenerateAssignment({});\n',
      { filePath: "coach/Example.ts" },
    );
    expect(coach.messages.map((message) => message.ruleId)).toContain("no-restricted-imports");

    const [allowed] = await eslint.lintText(
      'import { generateLearnerAssignment } from "./domain/assignment.js";\ngenerateLearnerAssignment({});\n',
      { filePath: "main.js" },
    );
    expect(allowed.messages.filter((message) => message.ruleId === "no-restricted-imports")).toEqual([]);
  }, 30_000);
});

describe("the Blues preset", () => {
  it("demonstrates minor blues with blues-riff-minor, sounding ♭5", () => {
    const blues = PRESET_CONFIGS.find((preset) => preset.id === "blues-a");
    expect(blues.mode).toBe("minorBlues");
    expect(blues.motifId).toBe("blues-riff-minor");

    const score = buildScore(generateLearnerAssignment(fromPreset(blues)));
    const degrees = score.parts.rh
      .filter((event) => event.kind === "note")
      .map((e) => formatDegreeToken(e.degree));
    expect(degrees).toContain("♭5");
    expect(
      score.parts.rh.every((event) => event.kind !== "note" || event.scaleMembership === "collection"),
    ).toBe(true);
  });
});
