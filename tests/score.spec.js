import { describe, expect, it } from "vitest";
import { buildScore, validateScore } from "../domain/score.ts";
import { formatDegreeToken } from "../domain/describe.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { noteStringToMidi } from "../theory.js";
import scoreFixture from "./fixtures/score-v2.json";
import { assignmentForSeed, propertySeeds } from "./support/fingerprint.js";

function eventFact(event) {
  return {
    part: event.part,
    startBeat: event.startBeat,
    durationBeats: event.durationBeats,
    midi: event.kind === "note" ? event.midi : null,
    rest: event.kind === "rest",
    expression: event.kind === "note" ? event.expression : null,
  };
}

function legacyFacts(assignment) {
  const lh = assignment.leftHand.bars.flatMap((bar) =>
    bar.steps.flatMap((step) => {
      const notes = step.notes?.length ? step.notes : step.note ? [step.note] : [];
      return notes.map((note) => ({
        part: "lh",
        startBeat: step.time,
        durationBeats: step.beats,
        midi: noteStringToMidi(note),
        rest: false,
        expression: {
          accent: step.dynamics?.accent || 0,
          ghost: step.dynamics?.ghost || 0,
          swingWeight: step.swingPosition || 0,
        },
      }));
    }),
  );

  const rh = [];
  const motif = assignment.motif;
  const totalBeats = assignment.progression.bars.length * 4;
  if (motif?.steps.length && motif.totalBeats > 0) {
    for (let offset = 0; offset < totalBeats; offset += motif.totalBeats) {
      motif.steps.forEach((step) => {
        const startBeat = offset + step.time;
        if (startBeat >= totalBeats) return;
        rh.push({
          part: "rh",
          startBeat,
          durationBeats: step.beats,
          midi: step.rest ? null : noteStringToMidi(step.note),
          rest: Boolean(step.rest),
          expression: step.rest
            ? null
            : {
                accent: step.dynamics?.accent || 0,
                ghost: step.dynamics?.ghost || 0,
                swingWeight: step.swingPosition || 0,
              },
        });
      });
    }
  }

  return [...lh, ...rh].sort(compareFacts);
}

function compareFacts(a, b) {
  return (
    a.startBeat - b.startBeat ||
    a.part.localeCompare(b.part) ||
    Number(a.rest) - Number(b.rest) ||
    (a.midi ?? -1) - (b.midi ?? -1)
  );
}

describe("Score v2", () => {
  it("matches the readable v2 contract fixture", () => {
    const assignment = generateFixtureAssignment();
    expect(buildScore(assignment)).toEqual(scoreFixture);
  });

  it("rejects a v1 Score, whose roles cannot express tones borrowed from the parent scale", () => {
    const v1 = { ...JSON.parse(JSON.stringify(scoreFixture)), schemaVersion: 1 };
    expect(validateScore(v1).errors).toContain("unsupported score schemaVersion");

    const noMembership = JSON.parse(JSON.stringify(scoreFixture));
    delete noMembership.parts.lh[0].scaleMembership;
    expect(validateScore(noMembership).errors).toContain("lh:0:0:0 has an invalid scale membership");

    const noParent = JSON.parse(JSON.stringify(scoreFixture));
    noParent.meta.parentScalePitchClasses = [0, 2, 4, 7, 9];
    expect(validateScore(noParent).errors).toContain(
      "meta.parentScalePitchClasses must contain seven pitch classes",
    );
  });

  it("is deterministic, runtime-valid, JSON-safe, and uniquely identified across 96 seeds", () => {
    for (const seed of propertySeeds()) {
      const assignment = assignmentForSeed(seed);
      const first = buildScore(assignment);
      const second = buildScore(assignment);
      const roundTripped = JSON.parse(JSON.stringify(first));
      const ids = [...first.parts.lh, ...first.parts.rh].map((event) => event.id);

      expect(second, seed).toEqual(first);
      expect(validateScore(first), seed).toEqual({ valid: true, errors: [] });
      expect(validateScore(roundTripped), seed).toEqual({ valid: true, errors: [] });
      expect(new Set(ids).size, `${seed}: event IDs must be unique`).toBe(ids.length);
      expect(first.meta.totalBeats, seed).toBe(first.meta.bars * first.meta.beatsPerBar);
      for (const event of [...first.parts.lh, ...first.parts.rh]) {
        expect(typeof event.durationBeats, `${seed}: ${event.id}`).toBe("number");
        expect(Number.isFinite(event.durationBeats), `${seed}: ${event.id}`).toBe(true);
        expect(event.durationBeats, `${seed}: ${event.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("matches the notes, rests, timing, and expression the legacy scheduler derives", () => {
    for (const seed of propertySeeds()) {
      const assignment = assignmentForSeed(seed);
      const scoreFacts = [...buildScore(assignment).parts.lh, ...buildScore(assignment).parts.rh]
        .map(eventFact)
        .sort(compareFacts);
      expect(scoreFacts, seed).toEqual(legacyFacts(assignment));
    }
  });

  it("represents altered and extended degrees structurally", () => {
    const labels = new Set();
    for (const seed of propertySeeds()) {
      const score = buildScore(assignmentForSeed(seed));
      for (const event of score.parts.rh) {
        if (event.kind === "note" && event.degree) labels.add(formatDegreeToken(event.degree));
      }
    }
    expect([...labels]).toEqual(expect.arrayContaining(["♭3", "8", "9", "10"]));
  });

  it("rejects non-numeric durations and duplicate event IDs at runtime", () => {
    const score = JSON.parse(JSON.stringify(buildScore(assignmentForSeed("property-0"))));
    score.parts.lh[0].durationBeats = "4n";
    expect(validateScore(score).errors).toContain(`${score.parts.lh[0].id} has an invalid durationBeats`);

    const duplicate = JSON.parse(JSON.stringify(buildScore(assignmentForSeed("property-0"))));
    duplicate.parts.rh[0].id = duplicate.parts.lh[0].id;
    expect(validateScore(duplicate).errors).toContain(`duplicate event id: ${duplicate.parts.lh[0].id}`);

    const wrongLength = JSON.parse(JSON.stringify(buildScore(assignmentForSeed("property-0"))));
    wrongLength.meta.totalBeats += 1;
    expect(validateScore(wrongLength).errors).toContain(
      "meta.totalBeats must equal bars multiplied by beatsPerBar",
    );
  });
});

function generateFixtureAssignment() {
  return generateAssignment({
    ...DEFAULT_ASSIGNMENT_INPUTS,
    length: 1,
    lhId: "block",
    motifId: "none",
    presetId: null,
    seed: "score-v1-fixture",
  });
}
