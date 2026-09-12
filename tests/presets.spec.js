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

  expect(plan?.lh?.anchorNote, `Preset ${preset.id} missing LH anchor`).toBeTruthy();
  expect(plan?.rh?.anchorNote, `Preset ${preset.id} missing RH anchor`).toBeTruthy();

  if (preset.anchors?.lh) {
    const expectedMidi = noteStringToMidi(preset.anchors.lh);
    const actualMidi = noteStringToMidi(plan.lh.anchorNote);
    expect(
      actualMidi,
      `Preset ${preset.id} LH anchor drifted (${plan.lh.anchorNote} vs ${preset.anchors.lh})`,
    ).toBe(expectedMidi);
  }

  if (preset.anchors?.rh) {
    const expectedMidi = noteStringToMidi(preset.anchors.rh);
    const actualMidi = noteStringToMidi(plan.rh.anchorNote);
    expect(
      actualMidi,
      `Preset ${preset.id} RH anchor drifted (${plan.rh.anchorNote} vs ${preset.anchors.rh})`,
    ).toBe(expectedMidi);
  }

  if (preset.anchors?.chords) {
    expect(plan.lh.chordAnchors, `Preset ${preset.id} did not forward chord anchors`).toBe(
      preset.anchors.chords,
    );
  }

  const lhMidi = noteStringToMidi(plan.lh.anchorNote);
  const rhMidi = noteStringToMidi(plan.rh.anchorNote);
  const gap = rhMidi - lhMidi;
  expect(gap, `Preset ${preset.id} LH/RH anchor gap ${gap} outside safe range`).toBeGreaterThanOrEqual(10);
  expect(gap, `Preset ${preset.id} LH/RH anchor gap ${gap} outside safe range`).toBeLessThanOrEqual(30);
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
