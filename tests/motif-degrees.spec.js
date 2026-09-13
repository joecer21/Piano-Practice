import { describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { describeMotifParts, formatDegreeToken } from "../domain/describe.ts";
import { degreeForInterval } from "../domain/degree.ts";
import { classifyPitch } from "../domain/score-query.ts";
import { buildScore, validateScore } from "../domain/score.ts";
import {
  DEGREE_INTERPRETATIONS,
  MOTIF_STYLES,
  NOTE_NAMES,
  NOTE_TO_INDEX,
  SCALE_PATTERNS,
  collectionIntervals,
  degreeTokenSemitones,
  noteStringToMidi,
  parentScaleIntervals,
} from "../theory.js";
import { COLLECTION_MODES, outsideCollectionNotes } from "./support/passing-tones.js";
import { assignmentForSeed, propertySeeds } from "./support/fingerprint.js";

const SEVEN_NOTE_MODES = Object.keys(SCALE_PATTERNS).filter((mode) => !COLLECTION_MODES.includes(mode));
const mod12 = (value) => ((value % 12) + 12) % 12;

function motifFor(inputs) {
  const assignment = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, seed: "motif-degrees", ...inputs });
  const score = buildScore(assignment);
  const cycleEnd = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const events = score.parts.rh.filter((event) => event.kind === "note" && event.startBeat < cycleEnd);
  const steps = assignment.motif.steps.filter((step) => !step.rest);
  return {
    assignment,
    score,
    events,
    steps,
    pitchClasses: steps.map((step) => mod12(noteStringToMidi(step.note))),
    degrees: events.map((event) => formatDegreeToken(event.degree)),
  };
}

const pcs = (...names) => names.map((name) => NOTE_TO_INDEX[name]);

describe("Motif degrees: acceptance", () => {
  it("C major 1-3-5-1 plays C-E-G-C", () => {
    const motif = motifFor({ key: "C", mode: "major", motifId: "pop-hook-1351" });
    expect(motif.pitchClasses.slice(0, 4)).toEqual(pcs("C", "E", "G", "C"));
    expect(motif.degrees.slice(0, 4)).toEqual(["1", "3", "5", "1"]);
  });

  it("C minor 1-3-5-1 keeps its shape as C-E♭-G-C, shown as 1-♭3-5-1", () => {
    const motif = motifFor({ key: "C", mode: "minor", motifId: "pop-hook-1351" });
    expect(motif.pitchClasses.slice(0, 4)).toEqual(pcs("C", "Eb", "G", "C"));
    expect(describeMotifParts(motif.score).degrees).toEqual(["1", "♭3", "5", "1"]);
  });

  it("A minor pentatonic 1-3-5-1 plays A-C-E-A, the parent minor scale's triad", () => {
    const motif = motifFor({ key: "A", mode: "pentatonicMinor", motifId: "pop-hook-1351" });
    expect(motif.pitchClasses.slice(0, 4)).toEqual(pcs("A", "C", "E", "A"));
    expect(describeMotifParts(motif.score).degrees).toEqual(["1", "♭3", "5", "1"]);
    expect(motif.events.every((event) => event.scaleMembership === "collection")).toBe(true);
  });

  it("an A minor-blues scale-step run climbs the blues collection, cycling past the octave", () => {
    const motif = motifFor({ key: "A", mode: "minorBlues", motifId: "scalar-run-8ths" });
    expect(motif.assignment.motif.degreeInterpretation).toBe("scale-step");
    expect(motif.pitchClasses).toEqual(pcs("A", "C", "D", "Eb", "E", "G", "A", "C"));
    const midis = motif.steps.map((step) => noteStringToMidi(step.note));
    midis.slice(1).forEach((midi, index) => expect(midi).toBeGreaterThan(midis[index]));
    expect(motif.degrees).toEqual(["1", "♭3", "4", "♭5", "5", "♭7", "8", "♭10"]);
  });

  it("an A minor pentatonic scale-step run is A-C-D-E-G-A-C-D", () => {
    const motif = motifFor({ key: "A", mode: "pentatonicMinor", motifId: "scalar-run-8ths" });
    expect(motif.pitchClasses).toEqual(pcs("A", "C", "D", "E", "G", "A", "C", "D"));
    // Octaves come from the pitch, not from counting five-note positions.
    expect(motif.events.map((event) => event.degree.octaveOffset)).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);
    expect(motif.degrees).toEqual(["1", "♭3", "4", "5", "♭7", "8", "♭10", "11"]);
  });

  it("keeps a parent-degree 2 in A minor pentatonic as B, identified as a passing tone", () => {
    const motif = motifFor({ key: "A", mode: "pentatonicMinor", motifId: "harmonic-rise" });
    const second = motif.events[1];
    expect(mod12(second.midi)).toBe(NOTE_TO_INDEX.B);
    expect(formatDegreeToken(second.degree)).toBe("2");
    expect(second.scaleMembership).toBe("parentScale");
    expect(second.role).toBe("parentScaleTone");
    expect(classifyPitch(motif.score, second.midi, second.startBeat)).toMatchObject({
      role: "parentScaleTone",
      scaleMembership: "parentScale",
    });
    expect(describeMotifParts(motif.score).passingTones).toBe(
      "2 is a passing tone from the parent scale, outside pentatonic minor.",
    );
  });

  it("plays an explicit ♭3 as a minor third in major and minor contexts alike", () => {
    for (const mode of ["major", "minor", "pentatonicMajor", "pentatonicMinor"]) {
      const motif = motifFor({ key: "C", mode, motifId: "pent-grid" });
      expect(motif.pitchClasses[1], mode).toBe(NOTE_TO_INDEX.Eb);
      expect(motif.degrees[1], mode).toBe("♭3");
    }
    // Outside the parent major scale, and outside major pentatonic: truthfully chromatic.
    expect(
      motifFor({ key: "C", mode: "pentatonicMajor", motifId: "pent-grid" }).events[1].scaleMembership,
    ).toBe("chromatic");
  });
});

describe("Motif degrees: pattern metadata", () => {
  it("gives every pattern a known interpretation, defaulting to parent-degree", () => {
    for (const [id, motif] of Object.entries(MOTIF_STYLES)) {
      expect(DEGREE_INTERPRETATIONS, id).toContain(motif.degreeInterpretation);
    }
    expect(MOTIF_STYLES["pop-hook-1351"].degreeInterpretation).toBe("parent-degree");
  });

  it("marks only genuine scalar runs as scale-step", () => {
    const scaleStep = Object.entries(MOTIF_STYLES)
      .filter(([, motif]) => motif.degreeInterpretation === "scale-step")
      .map(([id]) => id);
    expect(scaleStep).toEqual(["scalar-run-8ths"]);
    // A run is a contiguous climb: every token one step above the last.
    for (const id of scaleStep) {
      const tokens = MOTIF_STYLES[id].degreePattern;
      tokens.slice(1).forEach((token, index) => expect(token - tokens[index], id).toBe(1));
    }
  });
});

describe("Motif degrees: every pentatonic and blues mode", () => {
  for (const mode of COLLECTION_MODES) {
    it(`${mode}: every note sounds its token, and the Score describes that pitch`, () => {
      const parent = parentScaleIntervals(mode);
      const collection = collectionIntervals(mode);
      for (const key of NOTE_NAMES) {
        for (const [motifId, style] of Object.entries(MOTIF_STYLES)) {
          const motif = motifFor({ key, mode, motifId });
          const root = NOTE_TO_INDEX[key];
          const label = `${mode} ${key} ${motifId}`;

          motif.steps.forEach((step, index) => {
            const token = step.degree;
            const expected = mod12(root + degreeTokenSemitones(token, mode, style.degreeInterpretation));
            expect(motif.pitchClasses[index], `${label} note ${index + 1} (${token})`).toBe(expected);

            const interval = mod12(motif.pitchClasses[index] - root);
            if (style.degreeInterpretation === "scale-step") {
              expect(collection, `${label}: a run stays in the collection`).toContain(interval);
            } else if (typeof token === "number") {
              // A plain parent-degree is never replaced, even when the collection omits it.
              expect(interval, label).toBe(parent[(token - 1) % 7]);
            }

            const event = motif.events[index];
            expect(event.midi, label).toBe(noteStringToMidi(step.note));
            expect(event.degree, label).toEqual(
              degreeForInterval(interval, collection, event.degree.octaveOffset),
            );
            const membership = collection.includes(interval)
              ? "collection"
              : parent.includes(interval)
                ? "parentScale"
                : "chromatic";
            expect(event.scaleMembership, label).toBe(membership);
          });
        }
      }
    });
  }

  it("reports every outside-collection note, and each is a parent-scale tone or an explicit alteration", () => {
    const rows = outsideCollectionNotes();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const label = `${row.motifId} ${row.mode} note ${row.noteIndex + 1}`;
      expect(row.interpretation, label).toBe("parent-degree");
      if (row.scaleMembership === "chromatic") expect(row.token, label).toMatch(/^[b#♭♯]/);
      else expect(row.scaleMembership, label).toBe("parentScale");
    }
  });
});

describe("Motif degrees: seven-note modes are unchanged", () => {
  it("reads every token the same whether it counts parent degrees or scale steps", () => {
    const tokens = [...Array.from({ length: 16 }, (_, index) => index + 1), "b3", "#4", "b7", "b10"];
    for (const mode of SEVEN_NOTE_MODES) {
      expect(parentScaleIntervals(mode), mode).toEqual(collectionIntervals(mode));
      for (const token of tokens) {
        expect(degreeTokenSemitones(token, mode, "parent-degree"), `${mode} ${token}`).toBe(
          degreeTokenSemitones(token, mode, "scale-step"),
        );
      }
    }
  });

  it("never marks a note as a parent-scale passing tone", () => {
    for (const seed of propertySeeds()) {
      const score = buildScore(assignmentForSeed(seed));
      if (!SEVEN_NOTE_MODES.includes(score.meta.mode)) continue;
      expect(score.meta.parentScalePitchClasses, seed).toEqual(score.meta.scalePitchClasses);
      for (const event of [...score.parts.lh, ...score.parts.rh]) {
        if (event.kind !== "note") continue;
        expect(event.scaleMembership, `${seed} ${event.id}`).not.toBe("parentScale");
        expect(event.role, `${seed} ${event.id}`).not.toBe("parentScaleTone");
      }
    }
  });
});

describe("Motif degrees: serialized Score", () => {
  it("round-trips membership and parent scale through JSON and stays valid", () => {
    const { score } = motifFor({ key: "A", mode: "pentatonicMinor", motifId: "harmonic-rise" });
    const roundTripped = JSON.parse(JSON.stringify(score));
    expect(validateScore(roundTripped)).toEqual({ valid: true, errors: [] });
    expect(roundTripped).toEqual(score);
    expect(roundTripped.meta.parentScalePitchClasses).toEqual(pcs("A", "B", "C", "D", "E", "F", "G"));
    expect(roundTripped.parts.rh.some((event) => event.scaleMembership === "parentScale")).toBe(true);
  });
});
