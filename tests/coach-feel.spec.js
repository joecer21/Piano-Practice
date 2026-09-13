import { describe, expect, it } from "vitest";
import { describeFeel, syncopation } from "../coach/feel.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { PRESET_CONFIGS } from "../presets.js";
import { SCALE_PATTERNS } from "../theory.js";

const feelFor = (inputs) =>
  describeFeel(buildScore(generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, ...inputs })));

describe("feel-first wording", () => {
  it("leads the first assignment with how it feels, not what it is called", () => {
    const feel = feelFor({});
    expect(feel.headline).toBe("Bright and hopeful.");
    expect(feel.lh).toBe("Your left hand moves in quick, even notes.");
    expect(feel.rh).toBe("Your right hand sings a two-bar phrase that climbs and lands.");
    expect(feel.why).toBe(
      "The chords make a loop that circles back to the start. The tune uses only notes from the key, so it sits comfortably over every bar, and it sounds most at rest where it lands on a filled key.",
    );
  });

  it("tells the harmony's journey from where each chord sits relative to home", () => {
    expect(feelFor({ progressionPresetId: "basic-cadence" }).why).toMatch(
      /^The chords make a loop that always comes home\./,
    );
    expect(feelFor({ progressionPresetId: "doo-wop" }).why).toMatch(/pulls you round again\./);
    expect(feelFor({ progressionPresetId: "jazz-251" }).why).toMatch(/start away from home/);
    expect(feelFor({ progressionPresetId: "modal-vamp" }).why).toMatch(/two-chord groove\./);
    const blues = feelFor(PRESET_CONFIGS.find((preset) => preset.id === "blues-a"));
    expect(blues.headline).toBe("Smoky and gritty.");
    expect(blues.why).toMatch(/^The chords take a twelve-bar walk away from home and back\./);
  });

  it("gives every mode its own mood", () => {
    const moods = Object.keys(SCALE_PATTERNS).map((mode) => feelFor({ mode }).headline);
    expect(new Set(moods).size).toBe(moods.length);
  });

  it("hears how busy the left hand is and whether the tune leans off the beat", () => {
    expect(feelFor({ lhId: "block" }).lh).toMatch(/^Your left hand holds long chords/);
    expect(feelFor({ motifId: "funk-sync" }).rh).toMatch(/leaning off the beat\.$/);
    expect(feelFor({ motifId: "scalar-run-8ths" }).rh).not.toMatch(/off the beat/);
    expect(feelFor({ motifId: "none" }).rh).toBeNull();
    expect(feelFor({ motifId: "none" }).why).toMatch(/Your right hand is free/);
  });

  it("scores syncopation per beat, so straight eighths are not mistaken for offbeats", () => {
    const notes = (starts) => starts.map((startBeat) => ({ startBeat }));
    expect(syncopation(notes([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]), 4)).toBe(0);
    expect(syncopation(notes([0, 0.5, 1.5, 2, 3]), 4)).toBe(0.25);
  });

  it("never falls back on theory vocabulary for any preset", () => {
    for (const preset of PRESET_CONFIGS) {
      const feel = feelFor(preset);
      for (const line of [feel.headline, feel.lh, feel.rh ?? "", feel.why]) {
        expect(line).not.toMatch(/major|minor|pentatonic|blues|dominant|tonic|\b[iv]+\b/i);
      }
      expect(feel.headline).toMatch(/^[A-Z][^.]+\.$/);
    }
  });
});
