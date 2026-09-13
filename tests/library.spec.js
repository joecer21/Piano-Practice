import { describe, expect, it, vi } from "vitest";
import { LIBRARY_STORAGE_KEY, MAX_STARRED, createLibrary } from "../application/library.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, normalizeAssignmentInputs } from "../domain/assignment.js";
import { encodeShareFragment } from "../domain/share.ts";

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
    expect(reloaded.preferences()).toEqual({ labelMode: "letters", sessionLength: "untimed" });
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
    expect(library.preferences()).toEqual({ labelMode: "degrees", sessionLength: 300 });
    expect(library.starred().map((entry) => entry.title)).toEqual(["Blues in A"]);
  });

  it("starts empty from corrupt, oversized or future-version storage", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ version: 2, last: "x" }),
      "x".repeat(70_000),
      "[]",
      "null",
    ]) {
      const library = createLibrary(memoryStorage({ [LIBRARY_STORAGE_KEY]: raw }));
      expect(library.lastInputs()).toBeNull();
      expect(library.starred()).toEqual([]);
    }
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
