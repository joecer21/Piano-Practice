import { decodeShareFragment } from "../domain/share.js";

export const PRACTICE_RECORD_SCHEMA_VERSION = 1;
export const PRACTICE_HISTORY_EXPORT_VERSION = 1;
export const PRACTICE_APPLICATION_VERSION = "2026.09";
export const MAX_PRACTICE_RECORDS = 200;

export type PracticeStatus = "incomplete" | "completed" | "abandoned";
export type PractisedHand = "left" | "right";
export type LearningLens = "whole" | "leftHand" | "rightHand" | "chords" | "notes" | "free";

export type PracticeRecord = {
  schemaVersion: typeof PRACTICE_RECORD_SCHEMA_VERSION;
  applicationVersion: string;
  id: string;
  assignment: { fragment: string; title: string };
  startedAt: string;
  completedAt: string | null;
  activeDurationMs: number;
  startingTempo: number;
  endingTempo: number;
  status: PracticeStatus;
  handsPractised: PractisedHand[];
  /** One-based bar numbers, matching the labels shown to the learner. */
  barsVisited: number[];
  learningLenses: LearningLens[];
  needsWorkBars: number[];
  label: string | null;
  notes: string | null;
};

export type PracticeHistoryExport = {
  schemaVersion: typeof PRACTICE_HISTORY_EXPORT_VERSION;
  applicationVersion: string;
  exportedAt: string;
  records: PracticeRecord[];
};

export type PracticeRecommendation = {
  kind: "resume" | "marked-bar" | "revisit" | "new-key";
  recordId: string;
  title: string;
  reason: string;
  bar: number | null;
};

type NewPracticeRecord = {
  id: string;
  fragment: string;
  title: string;
  tempo: number;
  startedAt: Date;
};

type PracticeProgress = Partial<
  Pick<
    PracticeRecord,
    | "activeDurationMs"
    | "endingTempo"
    | "handsPractised"
    | "barsVisited"
    | "learningLenses"
    | "needsWorkBars"
    | "label"
    | "notes"
  >
>;

const STATUSES = new Set<PracticeStatus>(["incomplete", "completed", "abandoned"]);
const HANDS = new Set<PractisedHand>(["left", "right"]);
const LENSES = new Set<LearningLens>(["whole", "leftHand", "rightHand", "chords", "notes", "free"]);
const MAX_ID_LENGTH = 160;
const MAX_TITLE_LENGTH = 160;
const MAX_LABEL_LENGTH = 80;
const MAX_NOTES_LENGTH = 2_000;
const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_BAR = 128;
const MAX_IMPORT_BYTES = 2_000_000;

export function createPracticeRecord(input: NewPracticeRecord): PracticeRecord {
  const startedAt = validDateString(input.startedAt.toISOString()) ?? new Date(0).toISOString();
  return {
    schemaVersion: PRACTICE_RECORD_SCHEMA_VERSION,
    applicationVersion: PRACTICE_APPLICATION_VERSION,
    id: input.id,
    assignment: { fragment: input.fragment, title: cleanText(input.title, MAX_TITLE_LENGTH) || "Practice" },
    startedAt,
    completedAt: null,
    activeDurationMs: 0,
    startingTempo: input.tempo,
    endingTempo: input.tempo,
    status: "incomplete",
    handsPractised: [],
    barsVisited: [],
    learningLenses: [],
    needsWorkBars: [],
    label: null,
    notes: null,
  };
}

export function updatePracticeProgress(record: PracticeRecord, progress: PracticeProgress): PracticeRecord {
  return {
    ...record,
    activeDurationMs:
      progress.activeDurationMs == null
        ? record.activeDurationMs
        : clampInteger(progress.activeDurationMs, 0, MAX_DURATION_MS),
    endingTempo: progress.endingTempo == null ? record.endingTempo : validTempo(progress.endingTempo),
    handsPractised: progress.handsPractised
      ? uniqueEnum(progress.handsPractised, HANDS)
      : record.handsPractised,
    barsVisited: progress.barsVisited ? uniqueIntegers(progress.barsVisited) : record.barsVisited,
    learningLenses: progress.learningLenses
      ? uniqueEnum(progress.learningLenses, LENSES)
      : record.learningLenses,
    needsWorkBars: progress.needsWorkBars ? uniqueIntegers(progress.needsWorkBars) : record.needsWorkBars,
    label: progress.label === undefined ? record.label : nullableText(progress.label, MAX_LABEL_LENGTH),
    notes: progress.notes === undefined ? record.notes : nullableText(progress.notes, MAX_NOTES_LENGTH),
  };
}

export function finishPracticeRecord(
  record: PracticeRecord,
  status: Exclude<PracticeStatus, "incomplete">,
  completedAt: Date,
  progress: PracticeProgress = {},
): PracticeRecord {
  const updated = updatePracticeProgress(record, progress);
  // A wall clock can move backwards. Preserve a valid chronology rather than
  // manufacturing negative practice time.
  const endMs = Math.max(Date.parse(record.startedAt), completedAt.getTime());
  return { ...updated, status, completedAt: new Date(endMs).toISOString() };
}

export function parsePracticeRecord(value: unknown): PracticeRecord | null {
  if (!isRecord(value) || value.schemaVersion !== PRACTICE_RECORD_SCHEMA_VERSION) return null;
  if (
    typeof value.applicationVersion !== "string" ||
    value.applicationVersion.length < 1 ||
    value.applicationVersion.length > 40 ||
    !validId(value.id) ||
    !isRecord(value.assignment) ||
    typeof value.assignment.fragment !== "string" ||
    !decodeShareFragment(value.assignment.fragment).ok ||
    typeof value.assignment.title !== "string" ||
    value.assignment.title.length > MAX_TITLE_LENGTH * 2
  )
    return null;
  const startedAt = validDateString(value.startedAt);
  const completedAt = value.completedAt === null ? null : validDateString(value.completedAt);
  if (!startedAt || (value.completedAt !== null && !completedAt)) return null;
  if (!STATUSES.has(value.status as PracticeStatus)) return null;
  const status = value.status as PracticeStatus;
  if ((status === "incomplete") !== (completedAt === null)) return null;
  if (completedAt && Date.parse(completedAt) < Date.parse(startedAt)) return null;
  if (!validDuration(value.activeDurationMs) || !isTempo(value.startingTempo) || !isTempo(value.endingTempo))
    return null;
  if (!isEnumArray(value.handsPractised, HANDS) || !isIntegerArray(value.barsVisited)) return null;
  if (!isEnumArray(value.learningLenses, LENSES) || !isIntegerArray(value.needsWorkBars)) return null;
  if (
    !isNullableBoundedString(value.label, MAX_LABEL_LENGTH) ||
    !isNullableBoundedString(value.notes, MAX_NOTES_LENGTH)
  )
    return null;
  return {
    schemaVersion: PRACTICE_RECORD_SCHEMA_VERSION,
    applicationVersion: cleanText(value.applicationVersion, 40),
    id: value.id as string,
    assignment: {
      fragment: value.assignment.fragment,
      title: cleanText(value.assignment.title, MAX_TITLE_LENGTH) || "Practice",
    },
    startedAt,
    completedAt,
    activeDurationMs: value.activeDurationMs,
    startingTempo: value.startingTempo,
    endingTempo: value.endingTempo,
    status,
    handsPractised: uniqueEnum(value.handsPractised, HANDS),
    barsVisited: uniqueIntegers(value.barsVisited),
    learningLenses: uniqueEnum(value.learningLenses, LENSES),
    needsWorkBars: uniqueIntegers(value.needsWorkBars),
    label: nullableText(value.label, MAX_LABEL_LENGTH),
    notes: nullableText(value.notes, MAX_NOTES_LENGTH),
  };
}

export function exportPracticeHistory(records: readonly PracticeRecord[], now = new Date()): string {
  const envelope: PracticeHistoryExport = {
    schemaVersion: PRACTICE_HISTORY_EXPORT_VERSION,
    applicationVersion: PRACTICE_APPLICATION_VERSION,
    exportedAt: now.toISOString(),
    records: records.map((record) => ({ ...record, assignment: { ...record.assignment } })),
  };
  return JSON.stringify(envelope, null, 2);
}

export function parsePracticeHistoryExport(value: unknown): PracticeRecord[] | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (value.length > MAX_IMPORT_BYTES) return null;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== PRACTICE_HISTORY_EXPORT_VERSION ||
    typeof parsed.applicationVersion !== "string" ||
    parsed.applicationVersion.length < 1 ||
    parsed.applicationVersion.length > 40 ||
    !validDateString(parsed.exportedAt) ||
    !Array.isArray(parsed.records) ||
    parsed.records.length > MAX_PRACTICE_RECORDS
  )
    return null;
  const records = parsed.records.map(parsePracticeRecord);
  return records.every((record): record is PracticeRecord => record !== null) ? records : null;
}

/** One deterministic, explainable next step. Tempo is deliberately absent. */
export function recommendPractice(
  records: readonly PracticeRecord[],
  now: Date,
  revisitAfterDays: number,
): PracticeRecommendation | null {
  const ordered = [...records].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const incomplete = ordered.find((record) => record.status === "incomplete");
  if (incomplete)
    return {
      kind: "resume",
      recordId: incomplete.id,
      title: "Continue your last session",
      reason: "It was interrupted before you marked it complete.",
      bar: null,
    };
  const marked = ordered.find((record) => record.needsWorkBars.length > 0);
  if (marked)
    return {
      kind: "marked-bar",
      recordId: marked.id,
      title: `Focus on bar ${marked.needsWorkBars[0]}`,
      reason: "You marked this bar as needing work.",
      bar: marked.needsWorkBars[0],
    };
  const cutoff = now.getTime() - revisitAfterDays * 86_400_000;
  const due = [...ordered]
    .reverse()
    .find(
      (record) =>
        record.status === "completed" && Date.parse(record.completedAt ?? record.startedAt) <= cutoff,
    );
  if (due)
    return {
      kind: "revisit",
      recordId: due.id,
      title: "Revisit an earlier assignment",
      reason: `You last completed it at least ${revisitAfterDays} day${revisitAfterDays === 1 ? "" : "s"} ago.`,
      bar: null,
    };
  const complete = ordered.find((record) => record.status === "completed");
  return complete
    ? {
        kind: "new-key",
        recordId: complete.id,
        title: "Move a completed assignment to a new key",
        reason: "The musical shape is familiar; a new key makes the recall more flexible.",
        bar: null,
      }
    : null;
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function validDateString(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function isTempo(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 20 && value <= 300;
}

function validTempo(value: number): number {
  return clampInteger(value, 20, 300);
}

function validDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_DURATION_MS;
}

function isIntegerArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_BAR &&
    value.every((item) => Number.isInteger(item) && item >= 1 && item <= MAX_BAR)
  );
}

function isEnumArray<T extends string>(value: unknown, allowed: Set<T>): value is T[] {
  return (
    Array.isArray(value) && value.length <= allowed.size && value.every((item) => allowed.has(item as T))
  );
}

function uniqueIntegers(values: readonly number[]): number[] {
  return [
    ...new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= MAX_BAR)),
  ].sort((a, b) => a - b);
}

function uniqueEnum<T extends string>(values: readonly T[], allowed: Set<T>): T[] {
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

function nullableText(value: unknown, maximum: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  return cleanText(value, maximum) || null;
}

function isNullableBoundedString(value: unknown, maximum: number): boolean {
  return value === null || (typeof value === "string" && value.length <= maximum * 2);
}

function cleanText(value: string, maximum: number): string {
  return Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32 || character === "\n" || character === "\t")
    .join("")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maximum);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
