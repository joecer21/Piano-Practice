import type { DegreeToken, NoteEvent, Score, ScoreBar } from "./score.js";

export type AssignmentDescriptionContext = {
  leftHand?: { name?: string } | null;
  motif?: { description?: string } | null;
};

export function describeAssignment(score: Score, context: AssignmentDescriptionContext = {}): string {
  const progression = shortestRepeatingCycle(score.bars.map((bar) => bar.roman)).join("–");
  const leftHand = context.leftHand?.name || "Left hand";
  const motif = describeMotif(score);
  const upperPart = score.parts.rh.some((event) => event.kind === "note")
    ? `, ${motif || context.motif?.description || "a motif"} on top.`
    : ".";
  return `${score.meta.key} ${formatMode(score.meta.mode)}. ${progression}. ${leftHand} underneath${upperPart}`;
}

export type MotifDescription = { degrees: string[]; contour: string };

/** The motif's shortest repeating shape, as degree labels and a contour word. */
export function describeMotifParts(score: Score): MotifDescription | null {
  const cycleEnd = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const notes = score.parts.rh.filter(
    (event): event is NoteEvent => event.kind === "note" && event.startBeat < cycleEnd,
  );
  if (!notes.length) return null;
  const cycle = shortestRepeatingCycle(
    notes,
    (event) => `${event.midi}:${event.degree ? formatDegreeToken(event.degree) : "?"}`,
  );
  return {
    degrees: cycle.map((event) => (event.degree ? formatDegreeToken(event.degree) : "outside")),
    contour: describeContour(cycle.map((event) => event.midi)),
  };
}

export function describeMotif(score: Score): string {
  const parts = describeMotifParts(score);
  return parts ? `${parts.degrees.join(" → ")}, ${parts.contour}` : "";
}

type ChordQuality = "major" | "minor" | "diminished" | "dominant" | "other";

/**
 * Why a chord is there, in a few plain words.
 *
 * Derived from what the Score says the chord actually is - its root's distance
 * from the key and the intervals it contains - rather than from how the numeral
 * is spelled. The generator re-shapes chord qualities to the mode, and spells
 * some chords relative to major (a minor key's seven chord arrives as "bVII"), so
 * the numeral alone would misdescribe them.
 */
export function describeChordFunction(bar: ScoreBar, score: Score): string {
  return `${bar.roman} — ${chordFunctionText(bar, score)}`;
}

function chordFunctionText(bar: ScoreBar, score: Score): string {
  if (bar.provenance.kind === "secondaryDominant") {
    return bar.provenance.ofDegree == null
      ? "a borrowed dominant that briefly points somewhere new."
      : `a borrowed dominant that briefly points toward the ${ordinal(bar.provenance.ofDegree)} chord.`;
  }

  const root = score.meta.rootPitchClass;
  const fromHome = mod12(bar.rootPitchClass - root);
  const quality = chordQuality(bar);
  const minorKey =
    score.meta.scalePitchClasses.includes(mod12(root + 3)) &&
    !score.meta.scalePitchClasses.includes(mod12(root + 4));

  switch (fromHome) {
    case 0:
      if (quality === "dominant") return "home with a bluesy seventh: settled, but never quite still.";
      return minorKey
        ? "home, in a minor colour. Phrases come to rest here."
        : "home. Every phrase can land here.";
    case 7:
      if (quality === "minor") return "a soft five that leans toward home without insisting.";
      return "the strongest pull back to home.";
    case 5:
      if (quality === "dominant") return "the blues four: the first move away from home.";
      if (quality === "minor") {
        return minorKey
          ? "the minor four, a heavier step away from home."
          : "a minor four, borrowed for a wistful turn.";
      }
      return "moves away from home and opens the sound up.";
    case 2:
      if (quality === "diminished") return "a tense two that pushes toward the five.";
      if (quality === "minor") return "a gentle step away that sets up the five.";
      return "a bright, lifted two that wants to move on to the five.";
    case 4:
      return quality === "minor"
        ? "a soft shade of home; it shares two notes with the home chord."
        : "a bright surprise that usually heads for the six.";
    case 9:
      return quality === "minor"
        ? "home's darker twin, the relative minor."
        : "a lifted, borrowed six with an unexpected brightness.";
    case 3:
      return minorKey ? "the relative major, a brighter corner of the key." : "a darker, borrowed three.";
    case 8:
      return minorKey ? "a warm lift away from home." : "a dramatic, borrowed lift before heading home.";
    case 10:
      return minorKey
        ? "a step below home that swings back up to it."
        : "a rock-flavoured, borrowed step below home that swings back up.";
    case 11:
      return quality === "diminished"
        ? "tense and unstable; it wants to resolve up to home."
        : "a leading chord a step below home, reaching up to it.";
    default:
      return "adds colour from outside the home scale.";
  }
}

function chordQuality(bar: ScoreBar): ChordQuality {
  const intervals = new Set(bar.chordPitchClasses.map((pc) => mod12(pc - bar.rootPitchClass)));
  if (intervals.has(3) && intervals.has(6) && !intervals.has(7)) return "diminished";
  if (intervals.has(4) && intervals.has(10)) return "dominant";
  if (intervals.has(4)) return "major";
  if (intervals.has(3)) return "minor";
  return "other";
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];

/** ofDegree is zero-based: V/V targets degree 4, the fifth. */
function ordinal(degree: number): string {
  return ORDINALS[degree] ?? `degree ${degree + 1}`;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

export function formatDegreeToken(token: DegreeToken): string {
  const accidental = token.alteration < 0 ? "♭".repeat(-token.alteration) : "♯".repeat(token.alteration);
  const extendedNumber = token.number + token.octaveOffset * token.scaleSize;
  return `${accidental}${extendedNumber}`;
}

function describeContour(midis: number[]): string {
  if (midis.length < 2 || midis.every((midi) => midi === midis[0])) return "stays centered";
  const first = midis[0];
  const last = midis[midis.length - 1];
  const high = Math.max(...midis);
  const low = Math.min(...midis);
  if (first === last && high > first && low >= first) return "climbs and lands";
  if (first === last && low < first && high <= first) return "falls and returns";
  const moves = midis.slice(1).map((midi, index) => Math.sign(midi - midis[index]));
  const nonZeroMoves = moves.filter(Boolean);
  if (nonZeroMoves.every((move) => move >= 0)) return "climbs";
  if (nonZeroMoves.every((move) => move <= 0)) return "falls";
  return last >= first ? "arches upward" : "arches downward";
}

function formatMode(mode: string): string {
  return mode
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .toLowerCase();
}

function shortestRepeatingCycle<T>(values: readonly T[], key: (value: T) => string = String): T[] {
  if (!values.length) return [];
  for (let length = 1; length <= values.length; length += 1) {
    if (values.length % length !== 0) continue;
    const matches = values.every((value, index) => key(value) === key(values[index % length]));
    if (matches) return values.slice(0, length);
  }
  return [...values];
}
