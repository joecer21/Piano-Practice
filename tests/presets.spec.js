import { PRESET_CONFIGS } from "../presets.js";
import { createPhrasePlan, generateProgression, generateScale } from "../engine.js";
import { getStyleProfile, noteStringToMidi } from "../theory.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

function runPresetAssertions(preset) {
  const scale = generateScale({ key: preset.key, mode: preset.mode });
  const styleProfile = getStyleProfile(preset.styleId);
  const progression = generateProgression(
    {
      key: preset.key,
      mode: preset.mode,
      length: preset.length,
      progressionPresetId: preset.progressionPresetId,
    },
    scale,
    styleProfile,
  );

  expect(
    progression?.roman?.length,
    `Preset ${preset.id} expected ${preset.length} bars, received ${progression?.roman?.length}`,
  ).toBe(preset.length);
  expect(
    Array.isArray(progression.bars) && progression.bars.every((bar) => bar?.label),
    `Preset ${preset.id} progression returned unlabeled bars`,
  ).toBe(true);

  const plan = createPhrasePlan({
    key: preset.key,
    mode: preset.mode,
    styleId: preset.styleId,
    motifPatternId: preset.motifId,
    leftHandPatternId: preset.lhId,
    anchors: preset.anchors,
  });

  // A preset may name where its tune sits; the left hand is placed under it (tests/hand-lanes.spec.js).
  expect(plan?.rh?.anchorNote, `Preset ${preset.id} missing RH anchor`).toBeTruthy();
  if (preset.anchors?.rh) {
    expect(
      noteStringToMidi(plan.rh.anchorNote),
      `Preset ${preset.id} RH anchor drifted (${plan.rh.anchorNote} vs ${preset.anchors.rh})`,
    ).toBe(noteStringToMidi(preset.anchors.rh));
  }
}

function run() {
  describe("Preset catalog coverage", () => {
    PRESET_CONFIGS.forEach((preset) => {
      it(`${preset.name} (${preset.id})`, () => {
        runPresetAssertions(preset);
      });
    });
  });
}

run();
