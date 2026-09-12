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

export function describeMotif(score: Score): string {
  const cycleEnd = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const notes = score.parts.rh.filter(
    (event): event is NoteEvent => event.kind === "note" && event.startBeat < cycleEnd,
  );
  if (!notes.length) return "";
  const cycle = shortestRepeatingCycle(
    notes,
    (event) => `${event.midi}:${event.degree ? formatDegreeToken(event.degree) : "?"}`,
  );
  const degrees = cycle.map((event) => (event.degree ? formatDegreeToken(event.degree) : "outside"));
  return `${degrees.join(" → ")}, ${describeContour(cycle.map((event) => event.midi))}`;
}

export function describeChordFunction(bar: ScoreBar): string {
  const home = bar.roman.replace(/[^ivIV]/g, "").toUpperCase() === "I";
  const dominant = bar.roman.replace(/[^ivIV]/g, "").toUpperCase() === "V";
  if (bar.provenance.kind === "secondaryDominant") {
    const target = bar.provenance.ofDegree == null ? "another chord" : `degree ${bar.provenance.ofDegree}`;
    return `${bar.roman} — points briefly toward ${target}.`;
  }
  if (bar.provenance.kind === "chromatic") {
    return `${bar.roman} — adds color outside the home scale.`;
  }
  if (home) return `${bar.roman} — feels like home.`;
  if (dominant) return `${bar.roman} — pulls toward home.`;
  return `${bar.roman} — keeps the progression moving.`;
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
