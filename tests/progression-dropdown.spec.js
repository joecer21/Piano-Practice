import { PROGRESSION_PRESETS, getStyleProfile } from "../theory.js";
import { generateProgression, generateScale } from "../engine.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

function run() {
  describe("Progression generator coverage", () => {
    PROGRESSION_PRESETS.forEach((preset) => {
      it(`${preset.id} progression builds without gaps`, () => {
        runProgressionRenderTestsForPreset(preset);
      });
    });
  });
}

function runProgressionRenderTestsForPreset(preset) {
  const scale = generateScale({ key: "C", mode: "major" });
  const styleProfile = getStyleProfile("pop");
  const progression = generateProgression(
    {
      key: "C",
      mode: "major",
      length: preset.roman.length,
      progressionPresetId: preset.id,
    },
    scale,
    styleProfile,
  );

  expect(progression.roman.length, `Preset ${preset.id} changed roman length`).toBe(preset.roman.length);
  expect(progression.bars.length, `Preset ${preset.id} produced ${progression.bars.length} bars`).toBe(
    preset.roman.length,
  );
  expect(
    progression.bars.every((bar) => typeof bar.label === "string" && bar.label.length > 0),
    `Preset ${preset.id} has unlabeled bars`,
  ).toBe(true);
}

run();
