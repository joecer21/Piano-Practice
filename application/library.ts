import type { AssignmentInputs } from "../domain/assignment.js";
import { decodeShareFragment, encodeShareFragment } from "../domain/share.js";
import {
  MAX_PRACTICE_RECORDS,
  exportPracticeHistory,
  parsePracticeHistoryExport,
  parsePracticeRecord,
} from "./practice-record.js";
import type { PracticeRecord } from "./practice-record.js";

/**
 * What the app remembers between visits, in localStorage, local to this browser:
 * the last assignment, the tempo, starred assignments, and two practice
 * preferences. Nothing leaves the device.
 *
 * Assignments are stored as share fragments and read back through the same strict
 * decoder as a shared link. Storage can be edited, corrupted by an older version,
 * or unavailable (private browsing, blocked site data, a full quota), so every read
 * is validated, anything unrecognised is dropped, and every write is best effort.
 */
export const LIBRARY_STORAGE_KEY = "piano-practice:library";
export const LIBRARY_VERSION = 2;
export const MAX_STARRED = 50;
const MAX_STORED_BYTES = 1_000_000;
const MAX_TITLE_LENGTH = 120;
/** The tempo slider's range (index.html #tempo-slider). */
export const TEMPO_RANGE = { min: 60, max: 140 } as const;

export type LabelModePreference = "degrees" | "letters";
export type SessionLengthPreference = 120 | 300 | 600 | "untimed";
export type Preferences = {
  labelMode: LabelModePreference;
  sessionLength: SessionLengthPreference;
  revisitAfterDays: number;
};
export const DEFAULT_PREFERENCES: Preferences = {
  labelMode: "degrees",
  sessionLength: 300,
  revisitAfterDays: 7,
};

export type StarredAssignment = {
  fragment: string;
  inputs: AssignmentInputs;
  title: string;
  starredAt: string;
};

type StoredLibrary = {
  version: typeof LIBRARY_VERSION;
  last: string | null;
  tempo: number | null;
  starred: Array<{ fragment: string; title: string; starredAt: string }>;
  preferences: Preferences;
  practiceRecords: PracticeRecord[];
};

export type Library = ReturnType<typeof createLibrary>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function createLibrary(storage: StorageLike | null, now: () => Date = () => new Date()) {
  let data = read(storage);
  let starredView = buildStarredView(data);
  let practiceView: readonly PracticeRecord[] = Object.freeze([...data.practiceRecords]);
  const listeners = new Set<() => void>();

  const write = (): boolean => {
    starredView = buildStarredView(data);
    practiceView = Object.freeze([...data.practiceRecords]);
    let stored = storage !== null;
    try {
      storage?.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Quota or blocked storage: the app keeps working without memory.
      stored = false;
    }
    listeners.forEach((listener) => listener());
    return stored;
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    lastInputs(): AssignmentInputs | null {
      if (!data.last) return null;
      const decoded = decodeShareFragment(data.last);
      return decoded.ok ? decoded.inputs : null;
    },
    rememberInputs(inputs: AssignmentInputs): void {
      const fragment = encodeShareFragment(inputs);
      if (fragment === data.last) return;
      data = { ...data, last: fragment };
      write();
    },

    tempo(): number | null {
      return data.tempo;
    },
    rememberTempo(tempo: number): void {
      const valid = validTempo(tempo);
      if (valid == null || valid === data.tempo) return;
      data = { ...data, tempo: valid };
      write();
    },

    /** Stable until the starred list changes, for useSyncExternalStore. */
    starred(): readonly StarredAssignment[] {
      return starredView;
    },
    isStarred(inputs: AssignmentInputs): boolean {
      const fragment = encodeShareFragment(inputs);
      return data.starred.some((entry) => entry.fragment === fragment);
    },
    /** Star or unstar. Newest first; beyond MAX_STARRED the oldest is dropped. */
    toggleStar(inputs: AssignmentInputs, title: string): boolean {
      const fragment = encodeShareFragment(inputs);
      if (data.starred.some((entry) => entry.fragment === fragment)) {
        data = { ...data, starred: data.starred.filter((entry) => entry.fragment !== fragment) };
        write();
        return false;
      }
      const entry = { fragment, title: cleanTitle(title), starredAt: now().toISOString() };
      data = { ...data, starred: [entry, ...data.starred].slice(0, MAX_STARRED) };
      write();
      return true;
    },
    unstar(fragment: string): void {
      data = { ...data, starred: data.starred.filter((entry) => entry.fragment !== fragment) };
      write();
    },

    preferences(): Preferences {
      return data.preferences;
    },
    setPreference<K extends keyof Preferences>(name: K, value: Preferences[K]): void {
      const next = validPreferences({ ...data.preferences, [name]: value });
      if (next[name] !== value || data.preferences[name] === value) return;
      data = { ...data, preferences: next };
      write();
    },

    /** Stable until practice history changes, newest first. */
    practiceRecords(): readonly PracticeRecord[] {
      return practiceView;
    },
    savePracticeRecord(record: PracticeRecord): boolean {
      const valid = parsePracticeRecord(record);
      if (!valid) return false;
      const without = data.practiceRecords.filter((entry) => entry.id !== valid.id);
      data = {
        ...data,
        practiceRecords: [valid, ...without]
          .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
          .slice(0, MAX_PRACTICE_RECORDS),
      };
      return write();
    },
    deletePracticeRecord(id: string): void {
      const next = data.practiceRecords.filter((entry) => entry.id !== id);
      if (next.length === data.practiceRecords.length) return;
      data = { ...data, practiceRecords: next };
      write();
    },
    /** Only history is cleared; stars, tempo and preferences are deliberately preserved. */
    clearPracticeHistory(): void {
      if (!data.practiceRecords.length) return;
      data = { ...data, practiceRecords: [] };
      write();
    },
    exportPracticeHistory(): string {
      return exportPracticeHistory(data.practiceRecords, now());
    },
    importPracticeHistory(source: unknown): { ok: boolean; imported: number; duplicates: number } {
      const imported = parsePracticeHistoryExport(source);
      if (!imported) return { ok: false, imported: 0, duplicates: 0 };
      const existing = new Set(data.practiceRecords.map((record) => record.id));
      const additions = imported.filter((record) => {
        if (existing.has(record.id)) return false;
        existing.add(record.id);
        return true;
      });
      data = {
        ...data,
        practiceRecords: [...additions, ...data.practiceRecords]
          .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
          .slice(0, MAX_PRACTICE_RECORDS),
      };
      const stored = additions.length ? write() : true;
      return { ok: stored, imported: additions.length, duplicates: imported.length - additions.length };
    },
  };
}

function emptyLibrary(): StoredLibrary {
  return {
    version: LIBRARY_VERSION,
    last: null,
    tempo: null,
    starred: [],
    preferences: DEFAULT_PREFERENCES,
    practiceRecords: [],
  };
}

function read(storage: StorageLike | null): StoredLibrary {
  let raw: string | null;
  try {
    raw = storage?.getItem(LIBRARY_STORAGE_KEY) ?? null;
  } catch {
    return emptyLibrary();
  }
  if (!raw || raw.length > MAX_STORED_BYTES) return emptyLibrary();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyLibrary();
  }
  if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== LIBRARY_VERSION))
    return emptyLibrary();

  const starred = Array.isArray(parsed.starred) ? parsed.starred : [];
  const seen = new Set<string>();
  return {
    version: LIBRARY_VERSION,
    last: typeof parsed.last === "string" && decodeShareFragment(parsed.last).ok ? parsed.last : null,
    tempo: validTempo(parsed.tempo),
    starred: starred
      .filter(
        (entry): entry is { fragment: string; title: string; starredAt: string } =>
          isRecord(entry) &&
          typeof entry.fragment === "string" &&
          typeof entry.title === "string" &&
          typeof entry.starredAt === "string" &&
          !Number.isNaN(Date.parse(entry.starredAt)) &&
          decodeShareFragment(entry.fragment).ok,
      )
      .filter((entry) => !seen.has(entry.fragment) && seen.add(entry.fragment))
      .slice(0, MAX_STARRED)
      .map((entry) => ({
        fragment: entry.fragment,
        title: cleanTitle(entry.title),
        starredAt: entry.starredAt,
      })),
    preferences: validPreferences(isRecord(parsed.preferences) ? parsed.preferences : {}),
    practiceRecords:
      parsed.version === LIBRARY_VERSION && Array.isArray(parsed.practiceRecords)
        ? validatedPracticeRecords(parsed.practiceRecords)
        : [],
  };
}

function validatedPracticeRecords(values: unknown[]): PracticeRecord[] {
  const seen = new Set<string>();
  return values
    .map(parsePracticeRecord)
    .filter((record): record is PracticeRecord => record !== null)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .filter((record) => !seen.has(record.id) && seen.add(record.id))
    .slice(0, MAX_PRACTICE_RECORDS);
}

function buildStarredView(data: StoredLibrary): readonly StarredAssignment[] {
  return data.starred.flatMap((entry) => {
    const decoded = decodeShareFragment(entry.fragment);
    return decoded.ok ? [{ ...entry, inputs: decoded.inputs }] : [];
  });
}

function validTempo(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= TEMPO_RANGE.min &&
    value <= TEMPO_RANGE.max
    ? value
    : null;
}

function validPreferences(value: Record<string, unknown>): Preferences {
  const labelMode = value.labelMode === "letters" || value.labelMode === "degrees" ? value.labelMode : null;
  const sessionLength =
    value.sessionLength === 120 ||
    value.sessionLength === 300 ||
    value.sessionLength === 600 ||
    value.sessionLength === "untimed"
      ? value.sessionLength
      : null;
  const revisitAfterDays =
    typeof value.revisitAfterDays === "number" &&
    Number.isInteger(value.revisitAfterDays) &&
    value.revisitAfterDays >= 1 &&
    value.revisitAfterDays <= 90
      ? value.revisitAfterDays
      : null;
  return {
    labelMode: labelMode ?? DEFAULT_PREFERENCES.labelMode,
    sessionLength: sessionLength ?? DEFAULT_PREFERENCES.sessionLength,
    revisitAfterDays: revisitAfterDays ?? DEFAULT_PREFERENCES.revisitAfterDays,
  };
}

function cleanTitle(title: string): string {
  // Control characters out, whitespace collapsed; always rendered as text.
  const cleaned = Array.from(title)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Starred assignment").slice(0, MAX_TITLE_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
