import { JSDOM } from "jsdom";
import { populateProgressionSelector } from "../ui.js";
import { PROGRESSION_PRESETS, getStyleProfile } from "../theory.js";
import { generateProgression, generateScale } from "../engine.js";

function expect(condition, message) {
  if (!condition) {
    throw new Error(message || "Expectation failed");
  }
}

function describe(label, fn) {
  console.log(`\n${label}`);
  fn();
}

function it(label, fn) {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (err) {
    console.error(`✘ ${label}`);
    console.error(err.message);
    throw err;
  }
}

function runDomTest() {
  const dom = new JSDOM(`<!doctype html><body><select id="progression"></select></body>`);
  const select = dom.window.document.getElementById("progression");
  const wrapper = { progressionSelect: select };

  populateProgressionSelector(wrapper, PROGRESSION_PRESETS, PROGRESSION_PRESETS[0]?.id);

  const options = Array.from(select.options);
  expect(
    options.length === PROGRESSION_PRESETS.length + 1,
    `Dropdown expected ${PROGRESSION_PRESETS.length + 1} options, rendered ${options.length}`
  );

  PROGRESSION_PRESETS.forEach((preset) => {
    const option = options.find((opt) => opt.value === preset.id);
    expect(option, `Missing dropdown option for ${preset.id}`);
    expect(
      option.textContent.includes(preset.label) && option.textContent.includes("("),
      `Dropdown text for ${preset.id} missing label/roman summary`
    );
  });

  const customOption = options.find((opt) => opt.value === "custom");
  expect(customOption, "Missing custom option in dropdown");
  expect(/custom/i.test(customOption.textContent), "Custom option missing descriptive label");

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
    styleProfile
  );

  expect(progression.roman.length === preset.roman.length, `Preset ${preset.id} changed roman length`);
  expect(
    progression.bars.length === preset.roman.length,
    `Preset ${preset.id} produced ${progression.bars.length} bars`
  );
  expect(
    progression.bars.every((bar) => typeof bar.label === "string" && bar.label.length > 0),
    `Preset ${preset.id} has unlabeled bars`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

export { run };
