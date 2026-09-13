import { degreeForInterval } from "./degree.js";
import { classifyPitchClass } from "./score.js";
import type { DegreeToken, NoteRole, PartId, ScaleMembership, Score, ScoreBar, ScoreEvent } from "./score.js";

export type BeatRange = readonly [startBeat: number, endBeat: number];
export type PitchClassification = {
  degree: DegreeToken | null;
  role: NoteRole;
  scaleMembership: ScaleMembership;
};

/** Half-open beat range: the end beat belongs to the following bar. */
export function barBeatRange(score: Score, barIndex: number): BeatRange {
  assertBarIndex(score, barIndex);
  const startBeat = barIndex * score.meta.beatsPerBar;
  return [startBeat, startBeat + score.meta.beatsPerBar];
}

/**
 * Events whose onset falls inside a half-open beat range. This onset-based
 * contract is what one-bar scheduling needs; notes held across the boundary
 * are not retriggered in the following bar.
 */
export function eventsForPart(score: Score, part: PartId, range?: BeatRange): ScoreEvent[] {
  const events = score.parts[part];
  if (!range) return [...events];
  const [startBeat, endBeat] = range;
  if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || endBeat < startBeat) {
    throw new RangeError("event range must contain finite, ascending beats");
  }
  return events.filter((event) => event.startBeat >= startBeat && event.startBeat < endBeat);
}

export function eventsStartingInBar(
  score: Score,
  barIndex: number,
  parts: readonly PartId[] = ["lh", "rh"],
): ScoreEvent[] {
  const range = barBeatRange(score, barIndex);
  return parts
    .flatMap((part) => eventsForPart(score, part, range))
    .sort((a, b) => a.startBeat - b.startBeat || a.id.localeCompare(b.id));
}

export function activeChordAt(score: Score, beat: number): ScoreBar | null {
  if (!Number.isFinite(beat) || beat < 0 || beat >= score.meta.totalBeats) return null;
  return score.bars[Math.floor(beat / score.meta.beatsPerBar)] ?? null;
}

export function classifyPitch(score: Score, midi: number, beat: number): PitchClassification {
  if (!Number.isInteger(midi)) throw new TypeError("midi pitch must be an integer");
  const pitchClass = normalizePitchClass(midi);
  const bar = activeChordAt(score, beat);
  return {
    degree: degreeForPitchClass(score, pitchClass),
    ...classifyPitchClass(pitchClass, bar, score.meta),
  };
}

function degreeForPitchClass(score: Score, pitchClass: number): DegreeToken {
  const root = score.meta.rootPitchClass;
  const intervals = score.meta.scalePitchClasses.map((scalePitchClass) =>
    normalizePitchClass(scalePitchClass - root),
  );
  return degreeForInterval(pitchClass - root, intervals);
}

function normalizePitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}

function assertBarIndex(score: Score, barIndex: number): void {
  if (!Number.isInteger(barIndex) || barIndex < 0 || barIndex >= score.meta.bars) {
    throw new RangeError(`bar index ${barIndex} is outside the score`);
  }
}
