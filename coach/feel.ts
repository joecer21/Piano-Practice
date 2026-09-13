import { describeMotifParts } from "../domain/describe.js";
import type { NoteEvent, Score, ScoreEvent } from "../domain/score.js";

/**
 * How an assignment feels, in words a player can hear before they can name.
 *
 * Presentation only: everything is read from the Score the player hears, so a
 * custom progression or a new key is described just as truthfully as a preset.
 * The theory sentence (domain/describe.ts) stays beside this as the "in theory" line.
 */
export type Feel = {
  /** The Stage headline, set like an expression marking: "Bright and hopeful." */
  headline: string;
  /** What each hand does, in the second person. */
  lh: string;
  rh: string | null;
  /** "Why it works", on request: where the chords travel and how the tune sits on them. */
  why: string;
};

const MOODS: Readonly<Record<string, string>> = {
  major: "Bright and hopeful",
  minor: "Moody and reflective",
  pentatonicMajor: "Sunny and easygoing",
  pentatonicMinor: "Earthy and soulful",
  harmonicMinor: "Dark and dramatic",
  melodicMinor: "Bittersweet and smooth",
  majorBlues: "Relaxed, with a little grit",
  minorBlues: "Smoky and gritty",
};

/** Hand-written feels for the curated presets, listed first in the assignment panel. */
export const PRESET_FEELS: Readonly<Record<string, string>> = {
  "pop-c": "Bright and hopeful",
  "blues-a": "Gritty and leaning",
  "classical-f": "Poised and graceful",
  "lofi-d": "Hazy, late-night",
  "jazz-bb": "Smoky, always resolving",
  "harmonic-e": "Dark and dramatic",
  "modal-g": "Cool and floating",
  "pent-c": "Open and simple",
  "ned-shearon": "Warm and singable",
  "verde-dia": "Punchy, with a twist",
  coldplayer: "Wide and shimmering",
  "tayla-swift": "Wistful, then lifting",
  "billie-eyelash": "Hushed and dreamy",
  "brunho-bars": "Smooth and soulful",
  "daft-ponk": "Bouncy, head-nodding",
  "john-legendairy": "Tender and heartfelt",
};

export function describeFeel(score: Score): Feel {
  return {
    headline: `${MOODS[score.meta.mode] ?? "Warm and unhurried"}.`,
    lh: describeLeftHand(score),
    rh: describeRightHand(score),
    why: `${describeJourney(score)} ${describeFit(score)}`,
  };
}

/** Where the chords travel, told by distance from home rather than by numeral. */
export function describeJourney(score: Score): string {
  const home = score.meta.rootPitchClass;
  const roots = repeatingCycle(score.bars.map((bar) => mod12(bar.rootPitchClass - home)));
  if (roots.length === 12) return "The chords take a twelve-bar walk away from home and back.";
  if (new Set(roots).size <= 2) return "The chords settle into a two-chord groove.";
  if (roots[0] !== 0) return "The chords start away from home and find their way back.";
  const last = roots[roots.length - 1];
  if (last === 0) return "The chords make a loop that always comes home.";
  if (last === 7) return "The chords make a loop that pulls you round again.";
  return "The chords make a loop that circles back to the start.";
}

/** How the tune sits over the chords, and where it rests. */
function describeFit(score: Score): string {
  const motif = describeMotifParts(score);
  if (!motif) return "Your right hand is free: any filled key fits the bar you are in.";
  const borrows = motif.memberships.some((membership) => membership !== "collection");
  return borrows
    ? "The tune borrows a note from just outside the key for colour, and it sounds most at rest where it lands on a filled key."
    : "The tune uses only notes from the key, so it sits comfortably over every bar, and it sounds most at rest where it lands on a filled key.";
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
  return `Your left hand ${pulse}.`;
}

export function describeRightHand(score: Score): string | null {
  const motif = describeMotifParts(score);
  const notes = score.parts.rh.filter(isNote);
  if (!motif || !notes.length) return null;
  const cycleBeats = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const shape = cycleBeats <= 4 ? "a short hook" : cycleBeats <= 8 ? "a two-bar phrase" : "a long phrase";
  const lean = syncopation(notes, cycleBeats) >= 0.25 ? ", leaning off the beat" : "";
  return `Your right hand sings ${shape} that ${motif.contour}${lean}.`;
}

/**
 * Share of beats in the motif's cycle that are skipped on the beat but played
 * just around it: the push-and-pull of a syncopated line. Straight runs score 0.
 */
export function syncopation(notes: readonly Pick<NoteEvent, "startBeat">[], cycleBeats: number): number {
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
