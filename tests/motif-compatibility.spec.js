import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSIGNMENT_INPUTS,
  checkMotifOffer,
  generateAssignment,
  rerollAssignmentInputs,
} from "../domain/assignment.js";
import { describeMotifParts, formatDegreeToken } from "../domain/describe.ts";
import { buildScore } from "../domain/score.ts";
import {
  COLLECTION_CHARACTERISTIC_TONES,
  COLLECTION_MODE_IDS,
  MOTIF_STYLES,
  NOTE_NAMES,
  SCALE_PATTERNS,
  defineMotifStyle,
  isMotifOfferedInMode,
  motifFitForMode,
  noteStringToMidi,
} from "../theory.js";
import { melodicFunction, renderOutsideCollectionReport, sounds } from "./support/outside-collection.js";

const SEVEN_NOTE_MODES = Object.keys(SCALE_PATTERNS).filter((mode) => !COLLECTION_MODE_IDS.includes(mode));

/** The catalog every seven-note mode offered before collection fits existed, in order. */
const ORIGINAL_CATALOG = [
  "pop-hook-1351",
  "pop-offbeat-echo",
  "arpeggio-climb",
  "ballad-long",
  "ballad-call-response",
  "step-arch",
  "scalar-run-8ths",
  "funk-sync",
  "funk-stabs",
  "blues-riff",
  "modal-pedal",
  "lofi-sway",
  "swing-lick-3579",
  "harmonic-rise",
  "pent-grid",
];

function motifIn(motifId, mode, key = "A") {
  const assignment = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, key, mode, motifId, seed: "compat" });
  const score = buildScore(assignment);
  const cycleEnd = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const notes = score.parts.rh.filter((event) => event.kind === "note" && event.startBeat < cycleEnd);
  return {
    score,
    notes,
    degrees: notes.map((event) => formatDegreeToken(event.degree)),
    outside: [
      ...new Set(
        notes
          .filter((event) => event.scaleMembership !== "collection")
          .map((e) => formatDegreeToken(e.degree)),
      ),
    ],
  };
}

const combinations = Object.entries(MOTIF_STYLES).flatMap(([motifId, style]) =>
  COLLECTION_MODE_IDS.filter((mode) => style.modes.includes(mode)).map((mode) => ({
    motifId,
    mode,
    entry: style.collectionFit[mode],
  })),
);

describe("Motif compatibility: declarations match what the pattern plays", () => {
  it("requires every pattern to declare its fit for each pentatonic and blues mode it is written for", () => {
    const base = { category: "pop", rhythm: [{ beats: 4, rest: false }], degreePattern: [1] };
    expect(() => defineMotifStyle("missing", base)).toThrow(/must declare its fit for pentatonicMajor/);
    expect(() =>
      defineMotifStyle("unnamed-color", {
        ...base,
        modes: ["pentatonicMinor"],
        collectionFit: { pentatonicMinor: { fit: "color" } },
      }),
    ).toThrow(/names no colorTones/);
    expect(() => defineMotifStyle("seven-note-only", { ...base, modes: ["major"] })).not.toThrow();
  });

  for (const { motifId, mode, entry } of combinations) {
    it(`${motifId} in ${mode} is ${entry.fit} in every key`, () => {
      for (const key of NOTE_NAMES) {
        const { outside } = motifIn(motifId, mode, key);
        if (entry.fit === "strict")
          expect(outside, `${key}: a strict pattern stays in the collection`).toEqual([]);
        if (entry.fit === "color")
          expect(outside.sort(), `${key}: exactly the named colour tones`).toEqual(
            [...entry.colorTones].sort(),
          );
        if (entry.fit === "incompatible")
          expect(outside.length, `${key}: nothing to exclude`).toBeGreaterThan(0);
      }
    });
  }

  it("names every colour tone to the learner in Note by note", () => {
    for (const { motifId, mode, entry } of combinations.filter((c) => c.entry.fit === "color")) {
      const { score, notes } = motifIn(motifId, mode);
      const sentence = describeMotifParts(score).borrowedTones ?? "";
      for (const tone of entry.colorTones) {
        const note = notes.find((event) => formatDegreeToken(event.degree) === tone);
        expect(note.scaleMembership, `${motifId} ${mode} ${tone}`).toBe("parentScale");
        expect(sentence, `${motifId} ${mode}`).toContain(tone);
      }
    }
  });
});

describe("Motif compatibility: what is offered", () => {
  it("offers every seven-note mode the original catalog, in its original order", () => {
    for (const mode of SEVEN_NOTE_MODES) {
      expect(
        Object.keys(MOTIF_STYLES).filter((id) => isMotifOfferedInMode(id, mode)),
        mode,
      ).toEqual(ORIGINAL_CATALOG);
      expect(motifFitForMode("pop-hook-1351", mode)).toEqual({ fit: "native" });
    }
  });

  it("never offers an incompatible pattern, and offers strict and colour ones", () => {
    for (const { motifId, mode, entry } of combinations) {
      expect(isMotifOfferedInMode(motifId, mode), `${motifId} ${mode}`).toBe(entry.fit !== "incompatible");
    }
  });

  it("never rerolls into a pattern its mode does not offer, even with the motif locked", () => {
    let inputs = { ...DEFAULT_ASSIGNMENT_INPUTS };
    for (let index = 0; index < 400; index += 1) {
      inputs = rerollAssignmentInputs(inputs, { seed: `offer-${index}` });
      expect(isMotifOfferedInMode(inputs.motifId, inputs.mode), `${inputs.motifId} ${inputs.mode}`).toBe(
        true,
      );
    }
    const locked = { ...DEFAULT_ASSIGNMENT_INPUTS, mode: "harmonicMinor", motifId: "harmonic-rise" };
    for (let index = 0; index < 100; index += 1) {
      const next = rerollAssignmentInputs(locked, { seed: `locked-${index}`, locks: { motif: true } });
      expect(COLLECTION_MODE_IDS, `seed ${index}`).not.toContain(next.mode);
    }
  });

  it("explains an unoffered pattern and points to its variant, without changing it", () => {
    const inputs = { ...DEFAULT_ASSIGNMENT_INPUTS, mode: "majorBlues", motifId: "funk-sync" };
    expect(checkMotifOffer(inputs)).toEqual({
      offered: false,
      reason:
        "Funk Syncopation - root groove with rests isn't offered in Major Blues: Its major 7 lands on the downbeat of bar 2, accented.",
      variant: "funk-sync-6",
    });
    expect(inputs.motifId).toBe("funk-sync");
    expect(checkMotifOffer({ ...inputs, motifId: "blues-riff-minor" }).reason).toBe(
      "Blues Riff - minor blues ♭5 is written for other scales, not Major Blues.",
    );
    expect(checkMotifOffer({ ...inputs, motifId: "none" }).offered).toBe(true);
  });
});

describe("Motif compatibility: curation", () => {
  it("keeps pop-hook-1351's major 3 in major blues", () => {
    const { notes, degrees, outside } = motifIn("pop-hook-1351", "majorBlues");
    expect(degrees.slice(0, 4)).toEqual(["1", "3", "5", "1"]);
    expect(noteStringToMidi("C#5") % 12).toBe(notes[1].midi % 12);
    expect(outside).toEqual([]);
  });

  it("restricts harmonic-rise from every pentatonic and blues mode, and keeps it where it belongs", () => {
    for (const mode of COLLECTION_MODE_IDS)
      expect(isMotifOfferedInMode("harmonic-rise", mode), mode).toBe(false);
    expect(isMotifOfferedInMode("harmonic-rise", "harmonicMinor")).toBe(true);
  });

  it("answers funk-sync with a 6 where the major collections cannot take its structural 7", () => {
    const original = MOTIF_STYLES["funk-sync"];
    const variant = MOTIF_STYLES["funk-sync-6"];
    expect(variant.rhythm).toEqual(original.rhythm);
    expect(original.collectionFit.pentatonicMajor.variant).toBe("funk-sync-6");
    for (const mode of ["pentatonicMajor", "majorBlues"]) {
      const played = motifIn("funk-sync-6", mode);
      expect(played.degrees, mode).toEqual(["1", "5", "1", "5", "6", "1"]);
      expect(played.outside, mode).toEqual([]);
    }
  });

  it("gives minor blues its own riff on ♭5 and major blues its own ♭3-to-3 riff", () => {
    const minor = motifIn("blues-riff-minor", "minorBlues");
    expect(minor.degrees).toContain("♭5");
    const flatFive = minor.notes.find((event) => formatDegreeToken(event.degree) === "♭5");
    expect(flatFive.scaleMembership).toBe("collection");

    const major = motifIn("blues-riff-major", "majorBlues");
    const index = major.degrees.indexOf("♭3");
    expect(major.degrees[index + 1]).toBe("3");
    expect(major.notes[index + 1].midi - major.notes[index].midi).toBe(1);

    expect(MOTIF_STYLES["blues-riff-minor"].modes).toEqual(["minorBlues"]);
    expect(MOTIF_STYLES["blues-riff-major"].modes).toEqual(["majorBlues"]);
  });

  it("keeps modal-pedal and pent-grid out of strict wherever they borrow", () => {
    for (const motifId of ["modal-pedal", "pent-grid"]) {
      for (const mode of COLLECTION_MODE_IDS) {
        const { outside } = motifIn(motifId, mode);
        const { fit } = MOTIF_STYLES[motifId].collectionFit[mode];
        if (outside.length) expect(fit, `${motifId} ${mode}`).not.toBe("strict");
      }
    }
  });

  it("gives every pentatonic and blues mode an exemplar that plays its characteristic tone", () => {
    for (const mode of COLLECTION_MODE_IDS) {
      const tone = COLLECTION_CHARACTERISTIC_TONES[mode];
      const exemplars = combinations.filter((c) => c.mode === mode && c.entry.exemplar);
      expect(exemplars.length, mode).toBeGreaterThan(0);
      for (const { motifId } of exemplars) {
        expect(isMotifOfferedInMode(motifId, mode)).toBe(true);
        expect(
          motifIn(motifId, mode).notes.some((event) => sounds(event, tone)),
          `${motifId} ${mode} ${tone}`,
        ).toBe(true);
      }
    }
    expect(combinations.find((c) => c.mode === "minorBlues" && c.entry.exemplar).motifId).toBe(
      "blues-riff-minor",
    );
  });
});

describe("Outside-collection report", () => {
  it("calls a note a passing tone only when it steps through in one direction", () => {
    expect(melodicFunction([69, 71, 72], 1).name).toBe("passing tone");
    expect(melodicFunction([76, 77, 76, 69], 1).name).toBe("neighbour tone");
    expect(melodicFunction([69, 77, 76], 1).name).toBe("appoggiatura (leap in, step out)");
    expect(melodicFunction([76, 74, 69], 1).name).toBe("escape tone (step in, leap out)");
    expect(melodicFunction([76, 80, 69], 1).name).toBe("unresolved (leap in, leap back)");
    expect(melodicFunction([64, 68, 71], 1).name).toBe("arpeggiated (leaps on the same way)");
    // A repeated note is judged as one gesture: the pitch before and after it.
    expect(melodicFunction([73, 74, 74, 69], 1)).toMatchObject({
      name: "escape tone (step in, leap out)",
      repeated: true,
    });
  });

  it("reports chord, role, metric position, duration, accent and neighbouring notes", () => {
    const report = renderOutsideCollectionReport();
    expect(report).toContain(
      "| Note # | Token | Sounds as | Chord | Chord role | Metric position | Duration | Accent | Preceding | Following | Melodic function | Times |",
    );
    expect(report).toMatch(
      /### funk-sync · Pentatonic Major · incompatible[\s\S]*?\| 5 \| 7 \| 7 \(G#5\) \| A \|/,
    );
    expect(report).not.toMatch(/passing tones? from the parent scale/);
    for (const heading of [
      "## Compatibility",
      "## Decisions",
      "## Characteristic tones",
      "## Auditions",
      "## Judgment calls",
    ]) {
      expect(report).toContain(heading);
    }
  });
});
