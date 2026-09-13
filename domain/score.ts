import {
  DEFAULT_DEGREE_INTERPRETATION,
  NOTE_TO_INDEX,
  analyzeRomanAgainstMode,
  degreeTokenSemitones,
  noteStringToMidi,
  parentScaleIntervals,
  parseRomanSymbol,
} from "../theory.js";
import { degreeForInterval } from "./degree.js";

/**
 * v2: motif numbers are parent-scale degrees, so a note can sit in the mode's
 * seven-note parent scale without being in the selected pentatonic or blues
 * collection. v1 called such notes "chromatic"; v2 adds the parentScaleTone role,
 * each note's scaleMembership, and meta.parentScalePitchClasses. A v1 consumer
 * switching on role would silently mishandle the new value, hence the bump.
 */
export const SCORE_SCHEMA_VERSION = 2 as const;
export const SCORE_BEATS_PER_BAR = 4 as const;

export type PartId = "lh" | "rh";
export type DegreeNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type DegreeAlteration = -2 | -1 | 0 | 1 | 2;
export type Dynamic = "ghost" | "soft" | "normal" | "accent";
/**
 * What a note does over the bar's chord, most important first: the chord's root, a
 * chord tone, a note of the selected collection, a passing tone from the mode's
 * parent scale that the collection leaves out, or a note outside both.
 */
export type NoteRole = "root" | "chordTone" | "scaleTone" | "parentScaleTone" | "chromatic";
/**
 * Where a pitch sits relative to the key, regardless of the chord: in the selected
 * collection (for seven-note modes, the scale itself), only in its seven-note parent
 * scale, or in neither. A chord tone can be any of the three.
 */
export type ScaleMembership = "collection" | "parentScale" | "chromatic";
export type DegreeInterpretation = "parent-degree" | "scale-step";

/**
 * A scale degree named against the major scale (see domain/degree.ts): number
 * and alteration name the pitch relative to the key, octaveOffset marks
 * extensions such as 8 or 9, and scaleSize is the reference size used to spell
 * those extensions, which is always 7.
 */
export type DegreeToken = {
  number: DegreeNumber;
  alteration: DegreeAlteration;
  octaveOffset: number;
  scaleSize: number;
};

export type NoteExpression = {
  accent: number;
  ghost: number;
  swingWeight: number;
};

export type ScoreEventBase = {
  id: string;
  startBeat: number;
  durationBeats: number;
  part: PartId;
  barIndex: number;
};

export type NoteEvent = ScoreEventBase & {
  kind: "note";
  midi: number;
  degree: DegreeToken | null;
  role: NoteRole;
  scaleMembership: ScaleMembership;
  dynamic: Dynamic;
  expression: NoteExpression;
};

export type RestEvent = ScoreEventBase & {
  kind: "rest";
};

export type ScoreEvent = NoteEvent | RestEvent;

export type ChordProvenance =
  | { kind: "diatonic" }
  | { kind: "secondaryDominant"; ofDegree: number | null }
  | { kind: "chromatic"; reason: "accidental" | "quality" | "undefined" | "other" };

export type ScoreBar = {
  id: string;
  barIndex: number;
  startBeat: number;
  roman: string;
  chordSymbol: string;
  chordPitchClasses: number[];
  rootPitchClass: number;
  voicingMidis: {
    chord: number[];
    bass: number[];
  };
  provenance: ChordProvenance;
};

export type Score = {
  schemaVersion: typeof SCORE_SCHEMA_VERSION;
  sourceAssignmentId: string;
  meta: {
    bars: number;
    beatsPerBar: typeof SCORE_BEATS_PER_BAR;
    key: string;
    mode: string;
    rootPitchClass: number;
    /** The selected collection: five pitch classes for pentatonic, six for blues. */
    scalePitchClasses: number[];
    /** The seven-note scale the collection is drawn from (the scale itself for seven-note modes). */
    parentScalePitchClasses: number[];
    rhCycleBeats: number | null;
    totalBeats: number;
  };
  bars: ScoreBar[];
  parts: Record<PartId, ScoreEvent[]>;
};

type LegacyDynamics = { accent?: number; ghost?: number };
type LegacyStep = {
  time: number;
  beats: number;
  rest?: boolean;
  note?: string;
  notes?: string[];
  degree?: number | string;
  dynamics?: LegacyDynamics;
  swingPosition?: number;
};

type LegacyBar = {
  symbol: string;
  label?: string;
  chordNotes?: string[];
  bassNotes?: string[];
  root?: string;
  isDiatonic?: boolean;
  diatonicReason?: string | null;
};

export type ScoreAssignment = {
  id: string;
  inputs: { key: string; mode: string };
  scale: { root?: string; key?: string; mode?: string; intervals: number[] };
  progression: { bars: LegacyBar[]; roman: string[]; length: number };
  leftHand: { bars: Array<{ steps: LegacyStep[] }> };
  motif: { steps: LegacyStep[]; totalBeats: number; degreeInterpretation?: DegreeInterpretation } | null;
};

export type ScoreValidationResult = { valid: boolean; errors: string[] };

/**
 * Normalize a generated Assignment into the canonical, consumer-independent
 * musical representation. The Assignment remains the serialized source in v1;
 * Score is derived so there is only one persisted source of truth.
 */
export function buildScore(assignment: ScoreAssignment): Score {
  const bars = assignment.progression.bars.map((bar, barIndex) =>
    buildScoreBar(bar, barIndex, assignment.inputs.mode),
  );
  const totalBeats = bars.length * SCORE_BEATS_PER_BAR;
  const scaleContext = buildScaleContext(assignment);
  const score: Score = {
    schemaVersion: SCORE_SCHEMA_VERSION,
    sourceAssignmentId: assignment.id,
    meta: {
      bars: bars.length,
      beatsPerBar: SCORE_BEATS_PER_BAR,
      key: assignment.inputs.key,
      mode: assignment.inputs.mode,
      rootPitchClass: scaleContext.rootPitchClass,
      scalePitchClasses: [...scaleContext.scalePitchClasses],
      parentScalePitchClasses: [...scaleContext.parentScalePitchClasses],
      rhCycleBeats: assignment.motif?.totalBeats ?? null,
      totalBeats,
    },
    bars,
    parts: {
      lh: buildLeftHandEvents(assignment.leftHand, bars, scaleContext),
      rh: buildRightHandEvents(assignment.motif, bars, scaleContext, totalBeats),
    },
  };

  assertValidScore(score);
  return score;
}

export function validateScore(value: unknown): ScoreValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["score must be an object"] };

  if (value.schemaVersion !== SCORE_SCHEMA_VERSION) errors.push("unsupported score schemaVersion");
  if (typeof value.sourceAssignmentId !== "string" || !value.sourceAssignmentId) {
    errors.push("sourceAssignmentId is required");
  }

  const meta = isRecord(value.meta) ? value.meta : null;
  if (!meta) {
    errors.push("score meta is required");
  } else {
    if (!isPositiveInteger(meta.bars)) errors.push("meta.bars must be a positive integer");
    if (meta.beatsPerBar !== SCORE_BEATS_PER_BAR) errors.push("score v1 requires four beats per bar");
    if (!isFiniteNumber(meta.totalBeats) || meta.totalBeats < 0) {
      errors.push("meta.totalBeats must be a non-negative finite number");
    }
    if (meta.rhCycleBeats !== null && (!isFiniteNumber(meta.rhCycleBeats) || meta.rhCycleBeats <= 0)) {
      errors.push("meta.rhCycleBeats must be null or a positive finite number");
    }
    if (typeof meta.key !== "string" || !meta.key) errors.push("meta.key is required");
    if (typeof meta.mode !== "string" || !meta.mode) errors.push("meta.mode is required");
    if (!isPitchClass(meta.rootPitchClass)) errors.push("meta.rootPitchClass must be from 0 to 11");
    if (
      !Array.isArray(meta.scalePitchClasses) ||
      meta.scalePitchClasses.length < 1 ||
      meta.scalePitchClasses.length > 7 ||
      !meta.scalePitchClasses.every(isPitchClass)
    ) {
      errors.push("meta.scalePitchClasses must contain one to seven pitch classes");
    }
    if (
      !Array.isArray(meta.parentScalePitchClasses) ||
      meta.parentScalePitchClasses.length !== 7 ||
      !meta.parentScalePitchClasses.every(isPitchClass)
    ) {
      errors.push("meta.parentScalePitchClasses must contain seven pitch classes");
    }
  }

  const bars = Array.isArray(value.bars) ? value.bars : null;
  if (!bars) {
    errors.push("score bars must be an array");
  } else {
    if (meta && bars.length !== meta.bars) errors.push("score bar count must match meta.bars");
    validateBars(bars, errors);
  }

  if (
    meta &&
    isPositiveInteger(meta.bars) &&
    meta.beatsPerBar === SCORE_BEATS_PER_BAR &&
    meta.totalBeats !== meta.bars * meta.beatsPerBar
  ) {
    errors.push("meta.totalBeats must equal bars multiplied by beatsPerBar");
  }

  const parts = isRecord(value.parts) ? value.parts : null;
  if (!parts || !Array.isArray(parts.lh) || !Array.isArray(parts.rh)) {
    errors.push("score parts must contain lh and rh event arrays");
  } else {
    const eventIds = new Set<string>();
    validateEvents(parts.lh, "lh", meta, eventIds, errors);
    validateEvents(parts.rh, "rh", meta, eventIds, errors);
  }

  if (!isJsonSafe(value)) errors.push("score must contain only finite JSON-safe values");
  return { valid: errors.length === 0, errors };
}

export function assertValidScore(value: unknown): asserts value is Score {
  const result = validateScore(value);
  if (!result.valid) throw new TypeError(`Invalid score: ${result.errors.join("; ")}`);
}

function buildScoreBar(bar: LegacyBar, barIndex: number, mode: string): ScoreBar {
  const chordMidis = (bar.chordNotes ?? []).map(assertMidi);
  const bassMidis = (bar.bassNotes ?? []).map(assertMidi);
  const rootPitchClass =
    pitchClassForName(bar.root) ??
    (chordMidis[0] == null && bassMidis[0] == null ? null : pitchClass(chordMidis[0] ?? bassMidis[0]));
  if (rootPitchClass == null || chordMidis.length === 0) {
    throw new TypeError(`Progression bar ${barIndex} does not contain a usable chord`);
  }
  const analysis = analyzeRomanAgainstMode(bar.symbol, mode);
  const reason = bar.diatonicReason ?? analysis.reasonCode;

  return {
    id: `bar:${barIndex}`,
    barIndex,
    startBeat: barIndex * SCORE_BEATS_PER_BAR,
    roman: bar.symbol,
    chordSymbol: bar.label ?? bar.symbol,
    chordPitchClasses: uniqueSorted(chordMidis.map(pitchClass)),
    rootPitchClass,
    voicingMidis: { chord: chordMidis, bass: bassMidis },
    provenance: buildProvenance(bar.symbol, bar.isDiatonic ?? analysis.isDiatonic, reason),
  };
}

function buildProvenance(
  roman: string,
  isDiatonic: boolean,
  reason: string | null | undefined,
): ChordProvenance {
  if (isDiatonic && !reason) return { kind: "diatonic" };
  if (reason === "secondary") {
    const parsed = parseRomanSymbol(roman);
    return {
      kind: "secondaryDominant",
      ofDegree: typeof parsed.secondaryTargetDegree === "number" ? parsed.secondaryTargetDegree : null,
    };
  }
  return {
    kind: "chromatic",
    reason: reason === "accidental" || reason === "quality" || reason === "undefined" ? reason : "other",
  };
}

type ScaleContext = {
  mode: string;
  rootPitchClass: number;
  scalePitchClasses: number[];
  parentScalePitchClasses: number[];
  intervals: number[];
};

function buildScaleContext(assignment: ScoreAssignment): ScaleContext {
  const rootName = assignment.scale.root ?? assignment.scale.key ?? assignment.inputs.key;
  const rootPitchClass = pitchClassForName(rootName) ?? 0;
  const intervals = [...assignment.scale.intervals];
  const mode = assignment.inputs.mode;
  return {
    mode,
    rootPitchClass,
    intervals,
    scalePitchClasses: intervals.map((interval) => pitchClass(rootPitchClass + interval)),
    parentScalePitchClasses: (parentScaleIntervals(mode) as number[]).map((interval) =>
      pitchClass(rootPitchClass + interval),
    ),
  };
}

/**
 * Role and membership of a pitch class over a bar. Shared with score-query so the
 * keyboard classifies a key exactly as the Score classifies a note.
 */
export function classifyPitchClass(
  pc: number,
  bar: Pick<ScoreBar, "rootPitchClass" | "chordPitchClasses"> | null | undefined,
  meta: Pick<Score["meta"], "scalePitchClasses" | "parentScalePitchClasses">,
): { role: NoteRole; scaleMembership: ScaleMembership } {
  const scaleMembership: ScaleMembership = meta.scalePitchClasses.includes(pc)
    ? "collection"
    : meta.parentScalePitchClasses.includes(pc)
      ? "parentScale"
      : "chromatic";
  const role: NoteRole =
    bar && pc === bar.rootPitchClass
      ? "root"
      : bar?.chordPitchClasses.includes(pc)
        ? "chordTone"
        : scaleMembership === "collection"
          ? "scaleTone"
          : scaleMembership === "parentScale"
            ? "parentScaleTone"
            : "chromatic";
  return { role, scaleMembership };
}

function buildLeftHandEvents(
  leftHand: ScoreAssignment["leftHand"],
  bars: ScoreBar[],
  scale: ScaleContext,
): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  leftHand.bars.forEach((bar, barIndex) => {
    bar.steps.forEach((step, stepIndex) => {
      // The legacy scheduler gives `notes` precedence over `note`; mirror that
      // rule so malformed transitional data cannot produce doubled notes.
      const notes = step.notes?.length ? step.notes : step.note ? [step.note] : [];
      notes.forEach((note, noteIndex) => {
        const midi = assertMidi(note);
        events.push(
          createNoteEvent({
            id: `lh:${barIndex}:${stepIndex}:${noteIndex}`,
            midi,
            step,
            part: "lh",
            barIndex,
            degree: degreeForPitch(midi, scale),
            bar: bars[barIndex],
            scale,
          }),
        );
      });
    });
  });
  return sortEvents(events);
}

function buildRightHandEvents(
  motif: ScoreAssignment["motif"],
  bars: ScoreBar[],
  scale: ScaleContext,
  totalBeats: number,
): ScoreEvent[] {
  if (!motif?.steps.length || !isFiniteNumber(motif.totalBeats) || motif.totalBeats <= 0) return [];
  const events: ScoreEvent[] = [];
  const interpretation = motif.degreeInterpretation ?? DEFAULT_DEGREE_INTERPRETATION;

  for (let offset = 0, repeatIndex = 0; offset < totalBeats; offset += motif.totalBeats, repeatIndex += 1) {
    motif.steps.forEach((step, stepIndex) => {
      const startBeat = offset + step.time;
      if (startBeat >= totalBeats) return;
      const barIndex = Math.min(bars.length - 1, Math.floor(startBeat / SCORE_BEATS_PER_BAR));
      const eventStem = `rh:${barIndex}:${repeatIndex}:${stepIndex}`;
      if (step.rest) {
        events.push({
          kind: "rest",
          id: `${eventStem}:rest`,
          startBeat,
          durationBeats: step.beats,
          part: "rh",
          barIndex,
        });
        return;
      }
      if (!step.note) return;
      const midi = assertMidi(step.note);
      events.push(
        createNoteEvent({
          id: `${eventStem}:0`,
          midi,
          step: { ...step, time: startBeat },
          part: "rh",
          barIndex,
          // The degree is named from the pitch. The pattern token only says which
          // octave above home the note belongs to (8 and 9 are extensions), read
          // the way the engine read it to choose the pitch.
          degree: degreeForPitch(midi, scale, motifOctaveOffset(step.degree, scale.mode, interpretation)),
          bar: bars[barIndex],
          scale,
        }),
      );
    });
  }
  return sortEvents(events);
}

function createNoteEvent(options: {
  id: string;
  midi: number;
  step: LegacyStep;
  part: PartId;
  barIndex: number;
  degree: DegreeToken | null;
  bar: ScoreBar | undefined;
  scale: ScaleContext;
}): NoteEvent {
  const expression = expressionForStep(options.step);
  const { role, scaleMembership } = classifyPitchClass(pitchClass(options.midi), options.bar, options.scale);
  return {
    kind: "note",
    id: options.id,
    midi: options.midi,
    startBeat: options.step.time,
    durationBeats: options.step.beats,
    part: options.part,
    barIndex: options.barIndex,
    degree: options.degree,
    role,
    scaleMembership,
    dynamic: dynamicForExpression(expression),
    expression,
  };
}

function expressionForStep(step: LegacyStep): NoteExpression {
  return {
    accent: finiteOr(step.dynamics?.accent, 0),
    ghost: finiteOr(step.dynamics?.ghost, 0),
    swingWeight: finiteOr(step.swingPosition, 0),
  };
}

function dynamicForExpression(expression: NoteExpression): Dynamic {
  if (expression.ghost > 0) return "ghost";
  if (expression.accent >= 0.15) return "accent";
  if (expression.accent <= 0.05) return "soft";
  return "normal";
}

/**
 * Octaves above home of the pitch an engine motif token asks for ("8" and "9" sit
 * one octave up). Taken from the token's semitones, so it is the same whether the
 * pattern counts parent-scale degrees or collection steps: a scale-step "6" in
 * minor pentatonic is the upper tonic, octave 1, not a sixth.
 */
function motifOctaveOffset(
  value: number | string | undefined,
  mode: string,
  interpretation: DegreeInterpretation,
): number {
  if (value == null) return 0;
  const match = /^[b♭#♯]{0,2}(\d+)$/.exec(String(value).trim());
  if (!match || Number(match[1]) < 1) return 0;
  return Math.floor((degreeTokenSemitones(value, mode, interpretation) as number) / 12);
}

function degreeForPitch(midi: number, scale: ScaleContext, octaveOffset = 0): DegreeToken {
  return degreeForInterval(midi - scale.rootPitchClass, scale.intervals, octaveOffset);
}

function assertMidi(note: string): number {
  const midi = noteStringToMidi(note);
  if (!Number.isInteger(midi)) throw new TypeError(`Invalid note in assignment: ${note}`);
  return midi;
}

function pitchClassForName(note: string | undefined): number | null {
  const noteIndexes = NOTE_TO_INDEX as Record<string, number>;
  if (!note || !(note in noteIndexes)) return null;
  return pitchClass(noteIndexes[note]);
}

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function sortEvents(events: ScoreEvent[]): ScoreEvent[] {
  return events.sort((a, b) => a.startBeat - b.startBeat || a.id.localeCompare(b.id));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function validateBars(bars: unknown[], errors: string[]): void {
  const ids = new Set<string>();
  bars.forEach((bar, index) => {
    if (!isRecord(bar)) {
      errors.push(`bar ${index} must be an object`);
      return;
    }
    if (typeof bar.id !== "string" || !bar.id) errors.push(`bar ${index} requires an id`);
    else if (ids.has(bar.id)) errors.push(`duplicate bar id: ${bar.id}`);
    else ids.add(bar.id);
    if (bar.barIndex !== index) errors.push(`bar ${index} has an invalid barIndex`);
    if (bar.startBeat !== index * SCORE_BEATS_PER_BAR) errors.push(`bar ${index} has an invalid startBeat`);
    if (typeof bar.roman !== "string" || !bar.roman) errors.push(`bar ${index} requires a roman symbol`);
    if (typeof bar.chordSymbol !== "string" || !bar.chordSymbol) {
      errors.push(`bar ${index} requires a chord symbol`);
    }
    if (!isPitchClass(bar.rootPitchClass)) errors.push(`bar ${index} has an invalid rootPitchClass`);
    if (
      !Array.isArray(bar.chordPitchClasses) ||
      bar.chordPitchClasses.length === 0 ||
      !bar.chordPitchClasses.every(isPitchClass)
    ) {
      errors.push(`bar ${index} has invalid chordPitchClasses`);
    }
    if (
      !isRecord(bar.voicingMidis) ||
      !isMidiArray(bar.voicingMidis.chord) ||
      !isMidiArray(bar.voicingMidis.bass)
    ) {
      errors.push(`bar ${index} has invalid voicingMidis`);
    }
    if (!isProvenance(bar.provenance)) errors.push(`bar ${index} has invalid provenance`);
  });
}

function validateEvents(
  events: unknown[],
  expectedPart: PartId,
  meta: Record<string, unknown> | null,
  ids: Set<string>,
  errors: string[],
): void {
  events.forEach((event, index) => {
    if (!isRecord(event)) {
      errors.push(`${expectedPart}[${index}] must be an object`);
      return;
    }
    const id = event.id;
    if (typeof id !== "string" || !id) errors.push(`${expectedPart}[${index}] requires an id`);
    else if (ids.has(id)) errors.push(`duplicate event id: ${id}`);
    else ids.add(id);
    if (event.part !== expectedPart) errors.push(`${String(id)} has the wrong part`);
    if (!isFiniteNumber(event.startBeat) || event.startBeat < 0) {
      errors.push(`${String(id)} has an invalid startBeat`);
    }
    if (!isFiniteNumber(event.durationBeats) || event.durationBeats <= 0) {
      errors.push(`${String(id)} has an invalid durationBeats`);
    }
    const barIndex = event.barIndex;
    if (!isNonNegativeInteger(barIndex)) errors.push(`${String(id)} has an invalid barIndex`);
    else if (meta && isPositiveInteger(meta.bars) && barIndex >= meta.bars) {
      errors.push(`${String(id)} has a barIndex outside the score`);
    }
    const startBeat = event.startBeat;
    if (
      meta &&
      isFiniteNumber(meta.totalBeats) &&
      isFiniteNumber(startBeat) &&
      startBeat >= meta.totalBeats
    ) {
      errors.push(`${String(id)} starts outside the score`);
    }
    if (
      meta &&
      isPositiveInteger(meta.bars) &&
      meta.beatsPerBar === SCORE_BEATS_PER_BAR &&
      isFiniteNumber(startBeat) &&
      isNonNegativeInteger(barIndex) &&
      barIndex !== Math.min(meta.bars - 1, Math.floor(startBeat / meta.beatsPerBar))
    ) {
      errors.push(`${String(id)} has a barIndex inconsistent with startBeat`);
    }
    if (event.kind !== "note" && event.kind !== "rest") errors.push(`${String(id)} has an invalid kind`);
    if (event.kind === "note") {
      if (!isMidi(event.midi)) errors.push(`${String(id)} has an invalid midi pitch`);
      if (!isDegreeTokenOrNull(event.degree)) errors.push(`${String(id)} has an invalid degree`);
      if (!isNoteRole(event.role)) errors.push(`${String(id)} has an invalid note role`);
      if (!isScaleMembership(event.scaleMembership)) {
        errors.push(`${String(id)} has an invalid scale membership`);
      }
      if (!isDynamic(event.dynamic)) errors.push(`${String(id)} has an invalid dynamic`);
      if (!isExpression(event.expression)) errors.push(`${String(id)} requires expression metadata`);
    }
  });
}

function isDegreeTokenOrNull(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const alteration = value.alteration;
  return (
    isNonNegativeInteger(value.number) &&
    value.number >= 1 &&
    value.number <= 7 &&
    typeof alteration === "number" &&
    Number.isInteger(alteration) &&
    alteration >= -2 &&
    alteration <= 2 &&
    Number.isInteger(value.octaveOffset) &&
    isPositiveInteger(value.scaleSize) &&
    value.scaleSize <= 7 &&
    value.number <= value.scaleSize
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPitchClass(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 11;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isMidi(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 127;
}

function isMidiArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isMidi);
}

function isProvenance(value: unknown): value is ChordProvenance {
  if (!isRecord(value)) return false;
  if (value.kind === "diatonic") return true;
  if (value.kind === "secondaryDominant") {
    return value.ofDegree === null || isPositiveInteger(value.ofDegree);
  }
  return (
    value.kind === "chromatic" &&
    (value.reason === "accidental" ||
      value.reason === "quality" ||
      value.reason === "undefined" ||
      value.reason === "other")
  );
}

function isNoteRole(value: unknown): value is NoteRole {
  return (
    value === "root" ||
    value === "chordTone" ||
    value === "scaleTone" ||
    value === "parentScaleTone" ||
    value === "chromatic"
  );
}

function isScaleMembership(value: unknown): value is ScaleMembership {
  return value === "collection" || value === "parentScale" || value === "chromatic";
}

function isDynamic(value: unknown): value is Dynamic {
  return value === "ghost" || value === "soft" || value === "normal" || value === "accent";
}

function isExpression(value: unknown): value is NoteExpression {
  return (
    isRecord(value) &&
    isFiniteNumber(value.accent) &&
    value.accent >= 0 &&
    isFiniteNumber(value.ghost) &&
    value.ghost >= 0 &&
    isFiniteNumber(value.swingWeight) &&
    value.swingWeight >= 0
  );
}

function isJsonSafe(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const safe = value.every((entry) => isJsonSafe(entry, seen));
    seen.delete(value);
    return safe;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const safe = Object.values(value).every((entry) => isJsonSafe(entry, seen));
  seen.delete(value);
  return safe;
}
