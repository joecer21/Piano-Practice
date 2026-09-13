// Outside-collection notes: every note a motif plays that the selected pentatonic or
// blues collection leaves out, with what makes it stand out musically.
//
// Parent-degree motifs play such notes from the mode's seven-note parent scale
// rather than replacing them. That is deliberate, and it means each one should be
// heard: a brief passing tone is idiomatic, a long or accented one on a strong beat
// may not be. This collects them so they can be reviewed by ear.
//
// Loads domain/score.ts, so it runs under Vitest.

import { buildScore } from "../../domain/score.ts";
import { formatDegreeToken } from "../../domain/describe.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../../domain/assignment.js";
import {
  MOTIF_STYLES,
  SCALE_PATTERNS,
  STYLE_PROFILES,
  collectionIntervals,
  midiToNote,
} from "../../theory.js";

/** Collections that are not themselves seven-note scales. */
export const COLLECTION_MODES = Object.freeze(
  Object.keys(SCALE_PATTERNS).filter((mode) => collectionIntervals(mode).length !== 7),
);

/** A note held this long or longer is flagged as long. */
export const LONG_NOTE_BEATS = 1.5;

const REPORT_KEY = "A";

function motifCycle(assignment, score) {
  const cycleEnd = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const notes = score.parts.rh.filter((event) => event.kind === "note" && event.startBeat < cycleEnd);
  const tokens = assignment.motif.steps.filter((step) => !step.rest).map((step) => step.degree);
  return notes.map((event, index) => ({ event, token: tokens[index] }));
}

/**
 * One row per outside-collection note of one motif cycle, for every motif in every
 * pentatonic and blues mode. Accent is checked under every playback style, since
 * styles accent different beats.
 */
export function outsideCollectionNotes() {
  const rows = [];
  for (const motifId of Object.keys(MOTIF_STYLES)) {
    for (const mode of COLLECTION_MODES) {
      const styles = Object.keys(STYLE_PROFILES).map((styleId) => {
        const assignment = generateAssignment({
          ...DEFAULT_ASSIGNMENT_INPUTS,
          key: REPORT_KEY,
          mode,
          motifId,
          styleId,
          seed: `passing-tones:${motifId}:${mode}`,
        });
        return { styleId, cycle: motifCycle(assignment, buildScore(assignment)) };
      });
      const [{ cycle }] = styles;
      const outside = cycle.filter(({ event }) => event.scaleMembership !== "collection");

      cycle.forEach(({ event, token }, index) => {
        if (event.scaleMembership === "collection") return;
        const pitchClass = event.midi % 12;
        const samePitch = outside.filter((other) => other.event.midi % 12 === pitchClass).length;
        const previous = cycle[(index - 1 + cycle.length) % cycle.length].event;
        const beatInBar = event.startBeat % 4;
        rows.push({
          motifId,
          interpretation: MOTIF_STYLES[motifId].degreeInterpretation,
          mode,
          noteIndex: index,
          token: String(token),
          degree: event.degree ? formatDegreeToken(event.degree) : "?",
          pitch: midiToNote(event.midi),
          scaleMembership: event.scaleMembership,
          beats: event.durationBeats,
          beatInBar: beatInBar + 1,
          long: event.durationBeats >= LONG_NOTE_BEATS,
          strongBeat: beatInBar === 0 || beatInBar === 2,
          accentedIn: styles
            .filter((style) => style.cycle[index]?.event.dynamic === "accent")
            .map((style) => style.styleId),
          repeated: samePitch > 1 || (cycle.length > 1 && previous.midi % 12 === pitchClass),
          timesInCycle: samePitch,
        });
      });
    }
  }
  return rows;
}

export function flagsFor(row) {
  return [
    row.scaleMembership === "chromatic" ? "outside the parent scale too" : null,
    row.long ? `long (${row.beats} beats)` : null,
    row.strongBeat ? `strong beat (beat ${row.beatInBar})` : null,
    row.accentedIn.length ? `accented (${row.accentedIn.join(", ")})` : null,
    row.repeated ? `repeated (${row.timesInCycle}× per cycle)` : null,
  ].filter(Boolean);
}

export function renderOutsideCollectionReport(rows = outsideCollectionNotes()) {
  const flagged = rows.filter((row) => flagsFor(row).length);
  const lines = [
    "# Outside-collection motif notes",
    "",
    `Every note a motif plays that the selected pentatonic or blues collection leaves out, in the key of ${REPORT_KEY}.`,
    "Degrees are named from the pitch against the major scale, so they hold in every key.",
    "`parentScale` notes are passing tones from the mode's seven-note parent scale;",
    "`chromatic` notes are in neither, and come only from an explicitly altered token.",
    "",
    `${rows.length} notes in all; ${flagged.length} flagged as outside the parent scale too, long, on a strong beat, accented, or repeated.`,
    "",
    "| Motif | Mode | Note # | Token | Sounds as | Pitch | Membership | Beats | Beat | Flags |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => {
      const flags = flagsFor(row);
      const flagText = flags.length ? `**${flags.join("; ")}**` : "";
      return `| ${row.motifId} | ${row.mode} | ${row.noteIndex + 1} | ${row.token} | ${row.degree} | ${row.pitch} | ${row.scaleMembership} | ${row.beats} | ${row.beatInBar} | ${flagText} |`;
    }),
    "",
  ];
  return lines.join("\n");
}
