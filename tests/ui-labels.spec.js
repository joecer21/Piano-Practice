import { JSDOM } from "jsdom";
import { renderProgression, renderCustomProgressionPreview, renderPaletteButtons } from "../ui.js";
import { getProgressionPreset, STYLE_PALETTE_SETS, getStyleProfile } from "../theory.js";
import { it } from "vitest";
import { expectContract as expect } from "./test-helpers.js";

function setupDom() {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="progression-roman"></div>
    <div id="progression-chords"></div>
    <div id="progression-description"></div>
    <div id="progression-visual"></div>
    <div id="custom-progression-preview"></div>
    <div id="chord-palette"></div>
  </body>`);
  global.document = dom.window.document;
  global.window = dom.window;
  return dom;
}

function mockStateWithProgression(styleId = "jazz") {
  return {
    inputs: {
      mode: "major",
      styleId,
      customProgressionRoman: ["ii", "V", "I"],
    },
    derived: {
      scale: { mode: "major" },
      styleProfile: getStyleProfile(styleId),
      progression: {
        roman: ["ii", "V", "I"],
        bars: [
          { label: "Dm7", quality: "min7" },
          { label: "G7", quality: "dom7" },
          { label: "Cmaj7", quality: "maj7" },
        ],
      },
    },
  };
}

function run() {
  const domEnv = setupDom();
  const dom = {
    progressionRoman: document.getElementById("progression-roman"),
    progressionChords: document.getElementById("progression-chords"),
    progressionDescription: document.getElementById("progression-description"),
    progressionVisual: document.getElementById("progression-visual"),
    customPreview: document.getElementById("custom-progression-preview"),
    paletteContainer: document.getElementById("chord-palette"),
  };

  const state = mockStateWithProgression();
  renderProgression(state, dom, getProgressionPreset);
  expect(
    dom.progressionRoman.textContent.includes("ii7") &&
      dom.progressionRoman.textContent.includes("V7") &&
      dom.progressionRoman.textContent.includes("Imaj7"),
    `Progression labels missing jazz suffixes: ${dom.progressionRoman.textContent}`,
  );

  renderCustomProgressionPreview(state, dom);
  expect(
    dom.customPreview.textContent.includes("ii7") &&
      dom.customPreview.textContent.includes("V7") &&
      dom.customPreview.textContent.includes("Imaj7"),
    `Custom preview missing jazz suffixes: ${dom.customPreview.textContent}`,
  );

  renderPaletteButtons("jazz", dom, STYLE_PALETTE_SETS, {
    mode: "major",
    styleProfile: state.derived.styleProfile,
  });
  const firstButton = dom.paletteContainer.querySelector(".chord-button");
  expect(firstButton, "Chord palette did not render");
  expect(/maj7|7/.test(firstButton.textContent), `Palette labels missing suffix: ${firstButton.textContent}`);

  domEnv.window.close();
}

it("renders style-aware progression labels across the UI", run);
