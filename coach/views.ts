import type { NoteEvent, Score, ScoreBar } from "../domain/score.js";
import type { PracticeControls } from "./practice.js";

/**
 * The four ways into one assignment, each one click from the last. Every view is
 * a filter over the same keyboard and timeline, expressed as PracticeControls -
 * never a separate panel with its own playback.
 */
export type BreakdownView = "whole" | "hands" | "chords" | "notes";

export const BREAKDOWN_VIEWS: ReadonlyArray<{ view: BreakdownView; label: string }> = [
  { view: "whole", label: "The whole thing" },
  { view: "hands", label: "Hands apart" },
  { view: "chords", label: "Chord by chord" },
  { view: "notes", label: "Note by note" },
];

/** How many bars one pass of the motif spans, or null if there is no motif. */
export function motifPhraseBars(score: Score): number | null {
  const cycle = score.meta.rhCycleBeats;
  if (!score.parts.rh.some((event) => event.kind === "note") || cycle == null || cycle <= 0) return null;
  return Math.min(score.meta.bars, Math.max(1, Math.ceil(cycle / score.meta.beatsPerBar)));
}

/**
 * Controls on entering a view. Choices the player already made - speed, a
 * selected bar, which hand - carry over wherever the view allows them.
 */
export function controlsForView(
  view: BreakdownView,
  previous: PracticeControls,
  score: Score,
): PracticeControls {
  switch (view) {
    case "whole":
      return { ...previous, lens: "both", focusBar: null, phraseBars: null };
    case "hands":
      // "LH alone, RH alone, then together": start from a single hand.
      return { ...previous, lens: previous.lens === "both" ? "lh" : previous.lens, phraseBars: null };
    case "chords":
      return { ...previous, lens: "both", phraseBars: null };
    case "notes":
      // The motif, at half speed, without changing anything else.
      return {
        ...previous,
        lens: "rh",
        slow: true,
        loop: true,
        focusBar: null,
        phraseBars: motifPhraseBars(score),
      };
  }
}

export function hasMotif(score: Score): boolean {
  return motifPhraseBars(score) != null;
}

/** Step to another chord; wraps at either end so stepping never dead-ends. */
export function stepChord(score: Score, current: number | null, direction: 1 | -1): number {
  const bars = score.meta.bars;
  if (current == null) return direction === 1 ? 0 : bars - 1;
  return (((current + direction) % bars) + bars) % bars;
}

/** The exact keys of a bar's written voicing, bass and chord, lowest first. */
export function chordShapeMidis(bar: ScoreBar): number[] {
  return [...new Set([...bar.voicingMidis.bass, ...bar.voicingMidis.chord])].sort((a, b) => a - b);
}

/** Motif notes for one pass, in order, for the note-by-note view. */
export function motifCycleNotes(score: Score): NoteEvent[] {
  const cycleEnd = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  return score.parts.rh.filter(
    (event): event is NoteEvent => event.kind === "note" && event.startBeat < cycleEnd,
  );
}

/** Index of the motif note sounding at a score beat, folded into one pass of the motif. */
export function activeMotifNoteIndex(notes: readonly NoteEvent[], score: Score, sourceBeat: number): number {
  if (!notes.length) return -1;
  const cycle = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const beat = ((sourceBeat % cycle) + cycle) % cycle;
  let index = -1;
  notes.forEach((note, candidate) => {
    if (note.startBeat <= beat) index = candidate;
  });
  return index;
}
