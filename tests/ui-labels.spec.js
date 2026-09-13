import { JSDOM } from "jsdom";
import { renderProgression } from "../ui.js";
import { getProgressionPreset, getStyleProfile } from "../theory.js";
import { it } from "vitest";
import { expect } from "vitest";

function setupDom() {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="progression-roman"></div>
    <div id="progression-chords"></div>
    <div id="progression-description"></div>
    <div id="progression-visual"></div>
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
  };

  const state = mockStateWithProgression();
  renderProgression(state, dom, getProgressionPreset);
  expect(
    dom.progressionRoman.textContent.includes("ii7") &&
      dom.progressionRoman.textContent.includes("V7") &&
      dom.progressionRoman.textContent.includes("Imaj7"),
    `Progression labels missing jazz suffixes: ${dom.progressionRoman.textContent}`,
  ).toBe(true);

  domEnv.window.close();
}

it("renders style-aware progression labels across the UI", run);
