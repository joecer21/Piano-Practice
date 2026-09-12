import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAudioEngine } from "../audio/playback-engine.js";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.js";

function createDriver() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    configurations: [],
    notes: [],
    countIns: [],
    ends: [],
    cleared: [],
    released: [],
    start: vi.fn(),
    stop: vi.fn(),
    init: vi.fn(async () => {}),
    dispose: vi.fn(),
    configure(configuration) {
      this.configurations.push(configuration);
    },
    setTempo: vi.fn(),
    scheduleNote(group, callback) {
      const id = nextId++;
      this.notes.push({ id, ...group });
      callbacks.set(id, callback);
      return id;
    },
    scheduleCountIn(atBeat, beatIndex, callback) {
      const id = nextId++;
      this.countIns.push({ id, atBeat, beatIndex });
      callbacks.set(id, callback);
      return id;
    },
    scheduleEnd(atBeat, callback) {
      const id = nextId++;
      this.ends.push({ id, atBeat });
      callbacks.set(id, callback);
      return id;
    },
    clear(id) {
      this.cleared.push(id);
      callbacks.delete(id);
    },
    release(parts) {
      this.released.push([...parts]);
    },
    getSnapshot() {
      return { state: "stopped", positionBeats: 0 };
    },
    fire(id) {
      callbacks.get(id)?.();
    },
  };
}

function scoreFor(seed = 27) {
  return buildScore(
    generateAssignment({
      ...DEFAULT_ASSIGNMENT_INPUTS,
      seed,
      length: 4,
      lhId: "block",
    }),
  );
}

describe("AudioEngine playback sessions", () => {
  let driver;
  let engine;

  beforeEach(() => {
    driver = createDriver();
    engine = createAudioEngine(driver);
  });

  it("schedules only LH bar 3 at half speed without changing pitch or voicing", () => {
    const score = scoreFor();
    const expected = score.parts.lh.filter((event) => event.kind === "note" && event.barIndex === 2);

    engine.play({
      score,
      parts: ["lh"],
      barRange: [2, 2],
      rate: 0.5,
      loop: true,
      countIn: false,
      tempoBpm: 90,
    });

    expect(driver.configurations).toEqual([{ tempoBpm: 90, loop: true, loopStartBeat: 0, loopEndBeat: 8 }]);
    expect(driver.notes.flatMap((note) => note.eventIds).sort()).toEqual(
      expected.map((event) => event.id).sort(),
    );
    expect(driver.notes.flatMap((note) => note.midis).sort((a, b) => a - b)).toEqual(
      expected.map((event) => event.midi).sort((a, b) => a - b),
    );
    expect(driver.notes.every((note) => note.atBeat === (note.sourceStartBeat - 8) * 2)).toBe(true);
    const expectedById = new Map(expected.map((event) => [event.id, event]));
    expect(
      driver.notes.every((note) =>
        note.eventIds.every((eventId) => note.durationBeats === expectedById.get(eventId).durationBeats * 2),
      ),
    ).toBe(true);
  });

  it("plays a one-bar count-in once, outside the loop region", () => {
    const score = scoreFor();
    engine.play({
      score,
      parts: ["lh", "rh"],
      barRange: [1, 1],
      rate: 1,
      loop: true,
      countIn: true,
      tempoBpm: 72,
    });

    expect(driver.countIns.map(({ atBeat, beatIndex }) => ({ atBeat, beatIndex }))).toEqual([
      { atBeat: 0, beatIndex: 0 },
      { atBeat: 1, beatIndex: 1 },
      { atBeat: 2, beatIndex: 2 },
      { atBeat: 3, beatIndex: 3 },
    ]);
    expect(driver.configurations[0]).toMatchObject({ loopStartBeat: 4, loopEndBeat: 8 });
    expect(Math.min(...driver.notes.map((note) => note.atBeat))).toBe(4);
  });

  it("stopping one session clears only its events", () => {
    const score = scoreFor();
    const request = {
      score,
      parts: ["lh"],
      barRange: [0, 0],
      rate: 1,
      loop: true,
      countIn: false,
      tempoBpm: 90,
    };
    const first = engine.play(request);
    const firstIds = driver.notes.map((note) => note.id);
    const second = engine.play({ ...request, parts: ["rh"] });
    const secondIds = driver.notes.slice(firstIds.length).map((note) => note.id);

    first.stop();

    expect(first.status).toBe("stopped");
    expect(second.status).toBe("playing");
    expect(driver.cleared).toEqual(expect.arrayContaining(firstIds));
    expect(driver.cleared).not.toEqual(expect.arrayContaining(secondIds));
    expect(driver.stop).not.toHaveBeenCalled();
  });

  it("completes a non-looping session through its owned end event", () => {
    const score = scoreFor();
    const statuses = [];
    engine.on("status", (event) => statuses.push(event.status));
    const session = engine.play({
      score,
      parts: ["lh"],
      barRange: [0, 0],
      rate: 1,
      loop: false,
      countIn: false,
      tempoBpm: 90,
    });

    driver.fire(driver.ends[0].id);

    expect(session.status).toBe("completed");
    expect(statuses).toEqual(["playing", "completed"]);
    expect(driver.stop).toHaveBeenCalledOnce();
  });

  it("rejects malformed requests before touching the driver", () => {
    const score = scoreFor();
    expect(() =>
      engine.play({
        score,
        parts: ["lh"],
        barRange: [3, 2],
        rate: 0,
        loop: false,
        countIn: false,
        tempoBpm: 90,
      }),
    ).toThrow(/barRange/);
    expect(driver.configurations).toEqual([]);
    expect(driver.notes).toEqual([]);
  });

  it("cleans up a session when transport startup fails", () => {
    const score = scoreFor();
    const request = {
      score,
      parts: ["lh"],
      barRange: [0, 0],
      rate: 1,
      loop: true,
      countIn: false,
      tempoBpm: 90,
    };
    driver.start.mockImplementationOnce(() => {
      throw new Error("audio context unavailable");
    });

    expect(() => engine.play(request)).toThrow("audio context unavailable");
    const failedIds = driver.notes.map((note) => note.id);
    expect(driver.cleared).toEqual(expect.arrayContaining(failedIds));

    expect(() => engine.play(request)).not.toThrow();
    expect(driver.start).toHaveBeenCalledTimes(2);
  });
});
