import { describe, expect, it, vi } from "vitest";
import { LIBRARY_STORAGE_KEY, MAX_STARRED, createLibrary } from "../application/library.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, normalizeAssignmentInputs } from "../domain/assignment.js";
import { encodeShareFragment } from "../domain/share.ts";
import { createPracticeRecord, exportPracticeHistory } from "../application/practice-record.ts";

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

const inputs = (patch = {}) => normalizeAssignmentInputs({ ...DEFAULT_ASSIGNMENT_INPUTS, ...patch });
const minorBlues = inputs({
  key: "A",
  mode: "minorBlues",
  progressionPresetId: "blues-12-minor",
  motifId: "blues-riff-minor",
  length: 12,
});

describe("library", () => {
  it("remembers the last assignment, tempo and preferences across a reload", () => {
    const storage = memoryStorage();
    const first = createLibrary(storage);
    first.rememberInputs(minorBlues);
    first.rememberTempo(112);
    first.setPreference("labelMode", "letters");
    first.setPreference("sessionLength", "untimed");

    const reloaded = createLibrary(storage);
    expect(reloaded.lastInputs()).toEqual(minorBlues);
    expect(reloaded.tempo()).toBe(112);
    expect(reloaded.preferences()).toEqual({
      labelMode: "letters",
      sessionLength: "untimed",
      revisitAfterDays: 7,
    });
  });

  it("stars and unstars, newest first, keeping at most the limit", () => {
    let clock = 0;
    const library = createLibrary(memoryStorage(), () => new Date(Date.UTC(2026, 0, 1) + clock++ * 1000));
    const listener = vi.fn();
    library.subscribe(listener);

    expect(library.toggleStar(minorBlues, "A minor blues")).toBe(true);
    expect(library.isStarred(minorBlues)).toBe(true);
    expect(library.starred()).toEqual([
      {
        fragment: encodeShareFragment(minorBlues),
        inputs: minorBlues,
        title: "A minor blues",
        starredAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const view = library.starred();
    expect(library.starred()).toBe(view);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(library.toggleStar(minorBlues, "A minor blues")).toBe(false);
    expect(library.starred()).toEqual([]);

    for (let index = 0; index < MAX_STARRED + 5; index += 1) {
      library.toggleStar(inputs({ seed: `star-${index}` }), `Take ${index}`);
    }
    expect(library.starred()).toHaveLength(MAX_STARRED);
    expect(library.starred()[0].title).toBe(`Take ${MAX_STARRED + 4}`);

    library.unstar(library.starred()[0].fragment);
    expect(library.starred()[0].title).toBe(`Take ${MAX_STARRED + 3}`);
  });

  it("drops anything in storage it does not recognise, and keeps what is valid", () => {
    const good = encodeShareFragment(minorBlues);
    const storage = memoryStorage({
      [LIBRARY_STORAGE_KEY]: JSON.stringify({
        version: 1,
        last: "v=1&key=C&mode=constructor",
        tempo: 9999,
        preferences: { labelMode: "<b>", sessionLength: 42 },
        starred: [
          { fragment: good, title: "  Blues\n in A  ", starredAt: "2026-02-01T10:00:00.000Z" },
          { fragment: good, title: "duplicate", starredAt: "2026-02-01T10:00:00.000Z" },
          { fragment: "v=1&motif=funk-sync&mode=majorBlues", title: "bad", starredAt: "2026-02-01" },
          { fragment: good, title: "no date", starredAt: "yesterday" },
          "not an entry",
          { fragment: good, title: 7, starredAt: "2026-02-01" },
        ],
      }),
    });
    const library = createLibrary(storage);
    expect(library.lastInputs()).toBeNull();
    expect(library.tempo()).toBeNull();
    expect(library.preferences()).toEqual({ labelMode: "degrees", sessionLength: 300, revisitAfterDays: 7 });
    expect(library.starred().map((entry) => entry.title)).toEqual(["Blues in A"]);
  });

  it("migrates the current v1 library without losing assignment data or preferences", () => {
    const storage = memoryStorage({
      [LIBRARY_STORAGE_KEY]: JSON.stringify({
        version: 1,
        last: encodeShareFragment(minorBlues),
        tempo: 105,
        starred: [],
        preferences: { labelMode: "letters", sessionLength: 600 },
      }),
    });
    const library = createLibrary(storage);
    expect(library.lastInputs()).toEqual(minorBlues);
    expect(library.tempo()).toBe(105);
    expect(library.preferences()).toEqual({ labelMode: "letters", sessionLength: 600, revisitAfterDays: 7 });
    expect(library.practiceRecords()).toEqual([]);
  });

  it("persists records, drops malformed records, and de-duplicates imports by stable ID", () => {
    const storage = memoryStorage();
    const library = createLibrary(storage);
    const saved = createPracticeRecord({
      id: "practice-one",
      fragment: encodeShareFragment(minorBlues),
      title: "A blues",
      tempo: 90,
      startedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(library.savePracticeRecord(saved)).toBe(true);
    expect(createLibrary(storage).practiceRecords()).toEqual([saved]);

    const raw = JSON.parse(storage.items.get(LIBRARY_STORAGE_KEY));
    raw.practiceRecords.push({ ...saved, id: "bad id" });
    storage.items.set(LIBRARY_STORAGE_KEY, JSON.stringify(raw));
    expect(createLibrary(storage).practiceRecords()).toEqual([saved]);

    const exported = exportPracticeHistory([saved], new Date("2026-02-01T00:00:00Z"));
    expect(library.importPracticeHistory(exported)).toEqual({ ok: true, imported: 0, duplicates: 1 });

    const fresh = createLibrary(memoryStorage());
    const duplicatedFile = exportPracticeHistory([saved, saved], new Date("2026-02-01T00:00:00Z"));
    expect(fresh.importPracticeHistory(duplicatedFile)).toEqual({ ok: true, imported: 1, duplicates: 1 });
    expect(fresh.practiceRecords()).toHaveLength(1);
  });

  it("clears history without clearing unrelated preferences, tempo or stars", () => {
    const library = createLibrary(memoryStorage());
    library.rememberTempo(100);
    library.setPreference("labelMode", "letters");
    library.toggleStar(minorBlues, "A blues");
    library.savePracticeRecord(
      createPracticeRecord({
        id: "practice-clear",
        fragment: encodeShareFragment(minorBlues),
        title: "A blues",
        tempo: 100,
        startedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    library.clearPracticeHistory();
    expect(library.practiceRecords()).toEqual([]);
    expect(library.tempo()).toBe(100);
    expect(library.preferences().labelMode).toBe("letters");
    expect(library.starred()).toHaveLength(1);
  });

  it("starts empty from corrupt, oversized or future-version storage", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ version: 3, last: "x" }),
      "x".repeat(1_000_001),
      "[]",
      "null",
    ]) {
      const library = createLibrary(memoryStorage({ [LIBRARY_STORAGE_KEY]: raw }));
      expect(library.lastInputs()).toBeNull();
      expect(library.starred()).toEqual([]);
    }
  });

  it("never erases what another tab saved, and refreshes when told storage changed", () => {
    const storage = memoryStorage();
    const tabA = createLibrary(storage);
    const tabB = createLibrary(storage);
    const record = createPracticeRecord({
      id: "practice-other-tab",
      fragment: encodeShareFragment(minorBlues),
      title: "A minor blues",
      tempo: 90,
      startedAt: new Date("2026-09-01T10:00:00Z"),
    });

    expect(tabB.savePracticeRecord(record)).toBe(true);
    tabB.toggleStar(minorBlues, "A minor blues");
    // Tab A still holds the empty copy it loaded, and now changes something unrelated.
    tabA.rememberTempo(100);
    tabA.setPreference("labelMode", "letters");

    const reopened = createLibrary(storage);
    expect(reopened.practiceRecords().map((entry) => entry.id)).toEqual(["practice-other-tab"]);
    expect(reopened.starred()).toHaveLength(1);
    expect(reopened.tempo()).toBe(100);
    expect(reopened.preferences().labelMode).toBe("letters");

    const changed = vi.fn();
    tabB.subscribe(changed);
    tabB.reload();
    expect(changed).toHaveBeenCalledOnce();
    expect(tabB.tempo()).toBe(100);
    tabB.reload();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("does not overwrite a library written by a newer version", () => {
    const newer = JSON.stringify({ version: 3, last: "future", practiceRecords: [{ id: "keep-me" }] });
    const storage = memoryStorage({ [LIBRARY_STORAGE_KEY]: newer });
    const library = createLibrary(storage);

    library.rememberInputs(minorBlues);
    library.rememberTempo(100);
    library.toggleStar(minorBlues, "A minor blues");
    expect(storage.items.get(LIBRARY_STORAGE_KEY)).toBe(newer);
    expect(
      library.savePracticeRecord(
        createPracticeRecord({
          id: "practice-old-build",
          fragment: encodeShareFragment(minorBlues),
          title: "A minor blues",
          tempo: 90,
          startedAt: new Date("2026-09-01T10:00:00Z"),
        }),
      ),
    ).toBe(false);
    expect(storage.items.get(LIBRARY_STORAGE_KEY)).toBe(newer);
  });

  it("keeps working when the browser refuses storage", () => {
    const hostile = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    const library = createLibrary(hostile);
    expect(() => library.rememberInputs(minorBlues)).not.toThrow();
    expect(library.toggleStar(minorBlues, "A")).toBe(true);
    expect(library.isStarred(minorBlues)).toBe(true);
    expect(
      library.savePracticeRecord(
        createPracticeRecord({
          id: "practice-quota",
          fragment: encodeShareFragment(minorBlues),
          title: "A",
          tempo: 90,
          startedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      ),
    ).toBe(false);
    expect(library.practiceRecords()).toHaveLength(1);

    const none = createLibrary(null);
    none.rememberTempo(100);
    expect(none.tempo()).toBe(100);
  });

  it("ignores tempos and preferences outside what the app offers", () => {
    const library = createLibrary(memoryStorage());
    library.rememberTempo(30);
    library.rememberTempo(90.5);
    expect(library.tempo()).toBeNull();
    library.setPreference("sessionLength", 45);
    expect(library.preferences().sessionLength).toBe(300);
  });
});
