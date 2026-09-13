import { describe, expect, it } from "vitest";
import { describeFeel, syncopation } from "../coach/feel.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { PRESET_CONFIGS } from "../presets.js";
import { SCALE_PATTERNS } from "../theory.js";

const feelFor = (inputs) =>
  describeFeel(buildScore(generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, ...inputs })));
const presets = Array.isArray(PRESET_CONFIGS) ? PRESET_CONFIGS : Object.values(PRESET_CONFIGS);

describe("feel-first wording", () => {
  it("leads the first assignment with how it feels, not what it is called", () => {
    const feel = feelFor({});
    expect(feel.headline).toBe("Bright and open, a loop that circles back to the start.");
    expect(feel.hands.lh).toBe("Left hand moves in quick, even notes, low and out of the way.");
    expect(feel.hands.rh).toBe("Right hand sings a two-bar phrase that climbs and lands.");
  });

  it("tells the harmony's journey from where each chord sits relative to home", () => {
    expect(feelFor({ progressionPresetId: "basic-cadence" }).headline).toMatch(/always comes home\.$/);
    expect(feelFor({ progressionPresetId: "doo-wop" }).headline).toMatch(/pulls you round again\.$/);
    expect(feelFor({ progressionPresetId: "jazz-251" }).headline).toMatch(/starting away from home/);
    expect(feelFor({ progressionPresetId: "modal-vamp" }).headline).toMatch(/two-chord groove\.$/);
    expect(feelFor(presets.find((preset) => preset.id === "blues-a")).headline).toBe(
      "Smoky and gritty, a twelve-bar walk away from home and back.",
    );
  });

  it("gives every mode its own mood", () => {
    const moods = Object.keys(SCALE_PATTERNS).map((mode) => feelFor({ mode }).headline.split(",")[0]);
    expect(new Set(moods).size).toBe(moods.length);
  });

  it("hears how busy the left hand is and whether the tune leans off the beat", () => {
    expect(feelFor({ lhId: "block" }).hands.lh).toMatch(/^Left hand holds long chords/);
    expect(feelFor({ motifId: "funk-sync" }).hands.rh).toMatch(/leaning off the beat\.$/);
    expect(feelFor({ motifId: "scalar-run-8ths" }).hands.rh).not.toMatch(/off the beat/);
  });

  it("scores syncopation per beat, so straight eighths are not mistaken for offbeats", () => {
    const notes = (starts) => starts.map((startBeat) => ({ startBeat }));
    expect(syncopation(notes([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]), 4)).toBe(0);
    expect(syncopation(notes([0, 0.5, 1.5, 2, 3]), 4)).toBe(0.25);
  });

  it("never falls back on theory vocabulary for any preset", () => {
    for (const preset of presets) {
      const feel = feelFor(preset);
      for (const line of [feel.headline, feel.hands.lh, feel.hands.rh ?? ""]) {
        expect(line).not.toMatch(/major|minor|pentatonic|blues|dominant|tonic|\b[iv]+\b/i);
      }
      expect(feel.headline).toMatch(/^[A-Z][^.]+\.$/);
    }
  });
});
