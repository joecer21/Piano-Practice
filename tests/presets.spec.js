import { PRESET_CONFIGS } from "../presets.js";
import { createPhrasePlan, generateProgression, generateScale } from "../engine.js";
import { getStyleProfile, noteStringToMidi } from "../theory.js";
import { describe, it } from "vitest";
import { expectContract as expect } from "./test-helpers.js";

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
    progression?.roman?.length === preset.length,
    `Preset ${preset.id} expected ${preset.length} bars, received ${progression?.roman?.length}`,
  );
  expect(
    Array.isArray(progression.bars) && progression.bars.every((bar) => bar?.label),
    `Preset ${preset.id} progression returned unlabeled bars`,
  );

  const plan = createPhrasePlan({
    key: preset.key,
    mode: preset.mode,
    styleId: preset.styleId,
    motifPatternId: preset.motifId,
    leftHandPatternId: preset.lhId,
    anchors: preset.anchors,
  });

  expect(plan?.lh?.anchorNote, `Preset ${preset.id} missing LH anchor`);
  expect(plan?.rh?.anchorNote, `Preset ${preset.id} missing RH anchor`);

  if (preset.anchors?.lh) {
    const expectedMidi = noteStringToMidi(preset.anchors.lh);
    const actualMidi = noteStringToMidi(plan.lh.anchorNote);
    expect(
      actualMidi === expectedMidi,
      `Preset ${preset.id} LH anchor drifted (${plan.lh.anchorNote} vs ${preset.anchors.lh})`,
    );
  }

  if (preset.anchors?.rh) {
    const expectedMidi = noteStringToMidi(preset.anchors.rh);
    const actualMidi = noteStringToMidi(plan.rh.anchorNote);
    expect(
      actualMidi === expectedMidi,
      `Preset ${preset.id} RH anchor drifted (${plan.rh.anchorNote} vs ${preset.anchors.rh})`,
    );
  }

  if (preset.anchors?.chords) {
    expect(
      plan.lh.chordAnchors === preset.anchors.chords,
      `Preset ${preset.id} did not forward chord anchors`,
    );
  }

  const lhMidi = noteStringToMidi(plan.lh.anchorNote);
  const rhMidi = noteStringToMidi(plan.rh.anchorNote);
  const gap = rhMidi - lhMidi;
  expect(gap >= 10 && gap <= 30, `Preset ${preset.id} LH/RH anchor gap ${gap} outside safe range`);
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
