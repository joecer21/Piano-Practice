import { describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { describeChordFunction, describeMotifParts } from "../domain/describe.ts";
import { buildScore } from "../domain/score.ts";
import { DEFAULT_PRACTICE_CONTROLS, buildPracticeRequest } from "../coach/practice.ts";
import {
  activeMotifNoteIndex,
  chordShapeMidis,
  controlsForView,
  motifCycleNotes,
  motifPhraseBars,
  stepChord,
} from "../coach/views.ts";
import { PROGRESSION_PRESETS, SCALE_PATTERNS } from "../theory.js";
import { assignmentForCase, fingerprintCaseIds } from "./support/fingerprint.js";

const scoreFor = (inputs) => buildScore(generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, ...inputs }));
const cMajor = scoreFor({ key: "C", mode: "major", progressionPresetId: "pop-4", seed: "views" });

describe("breakdown views", () => {
  it("the whole thing plays every bar with both hands, keeping the player's speed", () => {
    const controls = controlsForView(
      "whole",
      { ...DEFAULT_PRACTICE_CONTROLS, lens: "rh", slow: true, focusBar: 3 },
      cMajor,
    );
    expect(controls).toMatchObject({ lens: "both", slow: true, focusBar: null, phraseBars: null });
  });

  it("hands apart starts from the left hand and keeps a chosen hand and bar", () => {
    expect(controlsForView("hands", DEFAULT_PRACTICE_CONTROLS, cMajor).lens).toBe("lh");
    const kept = controlsForView("hands", { ...DEFAULT_PRACTICE_CONTROLS, lens: "rh", focusBar: 2 }, cMajor);
    expect(kept).toMatchObject({ lens: "rh", focusBar: 2 });
  });

  it("note by note plays one pass of the motif, right hand, at half speed", () => {
    const controls = controlsForView("notes", DEFAULT_PRACTICE_CONTROLS, cMajor);
    const phrase = motifPhraseBars(cMajor);
    expect(phrase).toBeGreaterThanOrEqual(1);
    expect(controls).toMatchObject({
      lens: "rh",
      slow: true,
      loop: true,
      focusBar: null,
      phraseBars: phrase,
    });
    const request = buildPracticeRequest(cMajor, controls, { tempoBpm: 90, countIn: false });
    expect(request).toMatchObject({ parts: ["rh"], rate: 0.5, barRange: [0, phrase - 1] });
  });

  it("reports no motif phrase when the assignment has none", () => {
    const noMotif = scoreFor({ motifId: "none", seed: "no-motif" });
    expect(motifPhraseBars(noMotif)).toBeNull();
    expect(describeMotifParts(noMotif)).toBeNull();
  });

  it("steps chord by chord and wraps at either end", () => {
    expect(stepChord(cMajor, null, 1)).toBe(0);
    expect(stepChord(cMajor, null, -1)).toBe(cMajor.meta.bars - 1);
    expect(stepChord(cMajor, cMajor.meta.bars - 1, 1)).toBe(0);
    expect(stepChord(cMajor, 0, -1)).toBe(cMajor.meta.bars - 1);
  });

  it("the chord shape is exactly the bar's written voicing, bass included", () => {
    const bar = cMajor.bars[0];
    const shape = chordShapeMidis(bar);
    expect(shape).toEqual(
      [...new Set([...bar.voicingMidis.bass, ...bar.voicingMidis.chord])].sort((a, b) => a - b),
    );
    expect(shape.every((midi) => bar.chordPitchClasses.includes(midi % 12))).toBe(true);
  });

  it("follows the playhead through one pass of the motif", () => {
    const notes = motifCycleNotes(cMajor);
    expect(activeMotifNoteIndex(notes, cMajor, notes[0].startBeat)).toBe(0);
    expect(activeMotifNoteIndex(notes, cMajor, notes.at(-1).startBeat + 0.01)).toBe(notes.length - 1);
    // A later repeat of the motif folds back onto the same notes.
    const cycle = cMajor.meta.rhCycleBeats;
    expect(activeMotifNoteIndex(notes, cMajor, cycle + notes[1].startBeat)).toBe(1);
  });
});

describe("chord function wording", () => {
  const bar = (score, roman) => score.bars.find((candidate) => candidate.roman === roman);

  it("describes the pop progression in C major", () => {
    expect(describeChordFunction(cMajor.bars[0], cMajor)).toBe("I — home. Every phrase can land here.");
    expect(describeChordFunction(bar(cMajor, "V"), cMajor)).toBe("V — the strongest pull back to home.");
    expect(describeChordFunction(bar(cMajor, "vi"), cMajor)).toBe(
      "vi — home's darker twin, the relative minor.",
    );
    expect(describeChordFunction(bar(cMajor, "IV"), cMajor)).toBe(
      "IV — moves away from home and opens the sound up.",
    );
  });

  it("reads the chord's real function in a minor key, however the numeral is spelled", () => {
    // Natural minor's seven chord is spelled bVII and flagged chromatic by the
    // numeral analysis, but it belongs to the key. The wording must not call it
    // borrowed. Built by hand: the generator currently gets this chord wrong (below).
    const minor = scoreFor({ key: "A", mode: "minor", progressionPresetId: "rock-minor", seed: "minor" });
    const g = 7; // G, a whole step below A
    const seven = { ...minor.bars[1], roman: "bVII", rootPitchClass: g, chordPitchClasses: [2, 7, 11] };
    expect(describeChordFunction(seven, minor)).toBe("bVII — a step below home that swings back up to it.");
    const home = minor.bars.find((candidate) => candidate.rootPitchClass === minor.meta.rootPitchClass);
    expect(describeChordFunction(home, minor)).toMatch(/home, in a minor colour/);
  });

  // KNOWN ENGINE DEFECT, pinned so it cannot be forgotten. In minor-family modes
  // the generator applies a numeral's flat on top of the minor scale's already
  // flattened degree: rock-minor (i-bVII-bVI-bVII) in A minor plays Am-F#-E-F#
  // instead of Am-G-F-G. Fixing it changes generated music, so it belongs in its
  // own commit with a reviewed fingerprint re-freeze. When fixed, this test starts
  // failing; replace it.fails with it.
  it("plays rock-minor's bVII and bVI in A minor as G and F", () => {
    const minor = scoreFor({ key: "A", mode: "minor", progressionPresetId: "rock-minor", seed: "minor" });
    const roots = minor.bars.slice(0, 4).map((scoreBar) => scoreBar.rootPitchClass);
    expect(roots).toEqual([9, 7, 5, 7]);
  });

  it("names a secondary dominant's target by ordinal, not by a zero-based index", () => {
    const secondary = {
      ...cMajor.bars[0],
      roman: "V/V",
      provenance: { kind: "secondaryDominant", ofDegree: 4 },
    };
    expect(describeChordFunction(secondary, cMajor)).toBe(
      "V/V — a borrowed dominant that briefly points toward the fifth chord.",
    );
  });

  it("gives every bar of every preset, in every mode, a deterministic line", () => {
    const seen = new Set();
    for (const preset of PROGRESSION_PRESETS) {
      for (const mode of Object.keys(SCALE_PATTERNS)) {
        const inputs = {
          key: "D",
          mode,
          progressionPresetId: preset.id,
          seed: `wording-${preset.id}-${mode}`,
        };
        const score = scoreFor(inputs);
        const again = scoreFor(inputs);
        score.bars.forEach((scoreBar, index) => {
          const line = describeChordFunction(scoreBar, score);
          expect(line, `${preset.id} ${mode} bar ${index}`).toMatch(
            new RegExp(`^${escape(scoreBar.roman)} — \\S`),
          );
          expect(line).not.toMatch(/undefined|null|NaN/);
          expect(describeChordFunction(again.bars[index], again)).toBe(line);
          seen.add(line.slice(line.indexOf("—")));
        });
      }
    }
    // Not five generic sentences recycled: the wording distinguishes functions.
    expect(seen.size).toBeGreaterThan(10);
  });

  it("holds across the fingerprint cases", () => {
    for (const caseId of fingerprintCaseIds()) {
      const score = buildScore(assignmentForCase(caseId));
      score.bars.forEach((scoreBar) =>
        expect(describeChordFunction(scoreBar, score)).not.toMatch(/undefined|NaN/),
      );
    }
  });
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
