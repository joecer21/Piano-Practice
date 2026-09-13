import { describeMotifParts } from "../domain/describe.js";
import type { NoteEvent, Score, ScoreEvent } from "../domain/score.js";

/**
 * How an assignment feels, in words a player can hear before they can name.
 *
 * Presentation only: everything is read from the Score the player hears, so a
 * custom progression or a new key is described just as truthfully as a preset.
 * The theory sentence (domain/describe.ts) stays beside this as the "why".
 */
export type Feel = {
  /** One sentence for the Stage: the mood, then where the harmony travels. */
  headline: string;
  /** What each hand does, for the hands-apart view. */
  hands: { lh: string; rh: string | null };
};

const MOODS: Readonly<Record<string, string>> = {
  major: "Bright and open",
  minor: "Moody and reflective",
  pentatonicMajor: "Sunny and easygoing",
  pentatonicMinor: "Earthy and soulful",
  harmonicMinor: "Dark and dramatic",
  melodicMinor: "Bittersweet and smooth",
  majorBlues: "Relaxed, with a little grit",
  minorBlues: "Smoky and gritty",
};

export function describeFeel(score: Score): Feel {
  const mood = MOODS[score.meta.mode] ?? "Warm and unhurried";
  return {
    headline: `${mood}, ${describeJourney(score)}.`,
    hands: { lh: describeLeftHand(score), rh: describeRightHand(score) },
  };
}

/** Where the chords travel, told by distance from home rather than by numeral. */
export function describeJourney(score: Score): string {
  const home = score.meta.rootPitchClass;
  const roots = repeatingCycle(score.bars.map((bar) => mod12(bar.rootPitchClass - home)));
  if (roots.length === 12) return "a twelve-bar walk away from home and back";
  if (new Set(roots).size <= 2) return "settling into a two-chord groove";
  if (roots[0] !== 0) return "starting away from home and finding its way back";
  const last = roots[roots.length - 1];
  if (last === 0) return "a loop that always comes home";
  if (last === 7) return "a loop that pulls you round again";
  return "a loop that circles back to the start";
}

/** How busy the left hand is: distinct onsets per bar, chords counted once. */
export function describeLeftHand(score: Score): string {
  const perBar = onsetsPerBar(score.parts.lh, score.meta.bars);
  const pulse =
    perBar <= 1.5
      ? "holds long chords that breathe"
      : perBar <= 3
        ? "keeps an unhurried pulse"
        : perBar <= 5
          ? "keeps a steady pulse"
          : "moves in quick, even notes";
  return `Left hand ${pulse}, low and out of the way.`;
}

export function describeRightHand(score: Score): string | null {
  const motif = describeMotifParts(score);
  const notes = score.parts.rh.filter(isNote);
  if (!motif || !notes.length) return null;
  const cycleBeats = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const shape = cycleBeats <= 4 ? "a short hook" : cycleBeats <= 8 ? "a two-bar phrase" : "a long phrase";
  const lean = syncopation(notes, cycleBeats) >= 0.25 ? ", leaning off the beat" : "";
  return `Right hand sings ${shape} that ${motif.contour}${lean}.`;
}

/**
 * Share of beats in the motif's cycle that are skipped on the beat but played
 * just around it: the push-and-pull of a syncopated line. Straight runs score 0.
 */
export function syncopation(notes: readonly NoteEvent[], cycleBeats: number): number {
  const onsets = new Set(notes.filter((note) => note.startBeat < cycleBeats).map((note) => note.startBeat));
  const beats = Math.max(1, Math.floor(cycleBeats));
  let pushed = 0;
  for (let beat = 0; beat < beats; beat += 1) {
    if (!onsets.has(beat) && (onsets.has(beat - 0.5) || onsets.has(beat + 0.5))) pushed += 1;
  }
  return pushed / beats;
}

function onsetsPerBar(events: readonly ScoreEvent[], bars: number): number {
  const onsets = new Set(events.filter(isNote).map((event) => event.startBeat));
  return bars ? onsets.size / bars : 0;
}

function isNote(event: ScoreEvent): event is NoteEvent {
  return event.kind === "note";
}

function repeatingCycle(values: readonly number[]): number[] {
  for (let length = 1; length <= values.length; length += 1) {
    if (values.length % length !== 0) continue;
    if (values.every((value, index) => value === values[index % length])) return values.slice(0, length);
  }
  return [...values];
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
