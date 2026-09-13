// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { describeMotifParts } from "../domain/describe.ts";
import { buildScore } from "../domain/score.ts";
import { renderMotif } from "../ui.js";

function renderFor(inputs) {
  const assignment = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, seed: "legacy-panel", ...inputs });
  const score = buildScore(assignment);
  const dom = {
    motifRhythm: document.createElement("p"),
    motifPitches: document.createElement("p"),
    motifVisual: document.createElementNS("http://www.w3.org/2000/svg", "svg"),
  };
  renderMotif({ derived: { motif: assignment.motif, score } }, dom);
  return { dom, score };
}

describe("legacy motif panel", () => {
  it("shows the degrees that sound, the same ones Note by note shows", () => {
    const { dom, score } = renderFor({ key: "A", mode: "pentatonicMinor", motifId: "pop-hook-1351" });
    expect(dom.motifPitches.textContent).toBe(
      "Pitches: 1 - ♭3 - 5 - 1 - 1 - ♭3 - 5 - 1 -> A - C - E - A - A - C - E - A",
    );
    const { degrees } = describeMotifParts(score);
    expect(dom.motifPitches.textContent).toContain(degrees.join(" - "));
  });

  it("draws the contour from pitch, so a scale-step run climbs all the way", () => {
    const { dom } = renderFor({ key: "A", mode: "pentatonicMinor", motifId: "scalar-run-8ths" });
    const ys = dom.motifVisual
      .querySelector("polyline")
      .getAttribute("points")
      .split(" ")
      .map((point) => Number(point.split(",")[1]));
    ys.slice(1).forEach((y, index) => expect(y).toBeLessThan(ys[index]));
  });
});
