import { JSDOM } from "jsdom";
import { populateProgressionSelector } from "../ui.js";
import { PROGRESSION_PRESETS, getStyleProfile } from "../theory.js";
import { generateProgression, generateScale } from "../engine.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

function runDomTest() {
  const dom = new JSDOM(`<!doctype html><body><select id="progression"></select></body>`);
  const select = dom.window.document.getElementById("progression");
  const wrapper = { progressionSelect: select };

  populateProgressionSelector(wrapper, PROGRESSION_PRESETS, PROGRESSION_PRESETS[0]?.id);

  const options = Array.from(select.options);
  expect(
    options.length,
    `Dropdown expected ${PROGRESSION_PRESETS.length + 1} options, rendered ${options.length}`,
  ).toBe(PROGRESSION_PRESETS.length + 1);

  PROGRESSION_PRESETS.forEach((preset) => {
    const option = options.find((opt) => opt.value === preset.id);
    expect(option, `Missing dropdown option for ${preset.id}`).toBeTruthy();
    expect(
      option.textContent.includes(preset.label) && option.textContent.includes("("),
      `Dropdown text for ${preset.id} missing label/roman summary`,
    ).toBe(true);
  });

  const customOption = options.find((opt) => opt.value === "custom");
  expect(customOption, "Missing custom option in dropdown").toBeTruthy();
  expect(customOption.textContent, "Custom option missing descriptive label").toMatch(/custom/i);

  dom.window.close();
}

function run() {
  describe("Progression dropdown coverage", () => {
    it("renders every preset option plus Custom", runDomTest);
  });

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
