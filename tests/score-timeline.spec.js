import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { buildScore } from "../domain/score.ts";
import { renderPianoRoll } from "../ui.js";
import { assignmentForSeed } from "./support/fingerprint.js";

let domEnvironment;

afterEach(() => {
  domEnvironment?.window.close();
  domEnvironment = null;
  delete global.document;
  delete global.window;
});

describe("Score-backed piano roll", () => {
  it("renders the exact MIDI pitches used by playback instead of display-only octave shifts", () => {
    const assignment = assignmentForSeed("property-0");
    const score = buildScore(assignment);
    domEnvironment = new JSDOM('<!doctype html><body><svg id="piano-roll"></svg></body>');
    global.document = domEnvironment.window.document;
    global.window = domEnvironment.window;
    const svg = document.getElementById("piano-roll");
    const renderState = { derived: { score } };

    renderPianoRoll(renderState, { pianoRoll: svg });

    const renderedLeftHand = [...svg.querySelectorAll('rect[data-track="lh"]')].map((rect) => ({
      id: rect.getAttribute("data-event-id"),
      midi: Number(rect.getAttribute("data-midi")),
    }));
    const expectedLeftHand = score.parts.lh
      .filter((event) => event.kind === "note")
      .map((event) => ({ id: event.id, midi: event.midi }));

    expect(renderedLeftHand).toEqual(expectedLeftHand);
    expect(renderedLeftHand.some((event) => event.midi >= 64)).toBe(true);
    expect(svg.querySelector("#piano-roll-playhead")).not.toBeNull();
  });
});
