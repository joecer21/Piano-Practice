import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A minimal Tone double that records every node ever constructed and whether it
// was disposed, so leaks are observable rather than inferred.
const live = new Set();
const built = [];

class MockNode {
  constructor(kind) {
    this.kind = kind;
    this.disposed = false;
    this.wet = { value: 0 };
    this.volume = { value: 0 };
    this.pan = { value: 0 };
    live.add(this);
    built.push(this);
  }
  toDestination() {
    return this;
  }
  connect(node) {
    return node;
  }
  disconnect() {
    return this;
  }
  set() {
    return this;
  }
  start() {
    return this;
  }
  releaseAll() {
    return this;
  }
  dispose() {
    this.disposed = true;
    live.delete(this);
    return this;
  }
}

const countLive = (kind) => [...live].filter((node) => node.kind === kind).length;

vi.mock("tone", () => {
  class Sampler extends MockNode {
    constructor(options) {
      super("Sampler");
      // Tone loads asynchronously; resolve on a microtask like the real thing.
      queueMicrotask(() => options?.onload?.());
    }
  }
  let nextEventId = 1;
  const Transport = {
    bpm: { value: 90 },
    state: "stopped",
    position: 0,
    loop: false,
    loopEnd: 0,
    scheduled: new Map(),
    start() {
      this.state = "started";
    },
    stop() {
      this.state = "stopped";
    },
    cancel() {
      this.scheduled.clear();
    },
    schedule(callback, when) {
      const id = nextEventId++;
      this.scheduled.set(id, { callback, when });
      return id;
    },
    scheduleRepeat() {
      return nextEventId++;
    },
    clear(id) {
      this.scheduled.delete(id);
      return this;
    },
  };
  return {
    Limiter: class extends MockNode {
      constructor() {
        super("Limiter");
      }
    },
    Reverb: class extends MockNode {
      constructor() {
        super("Reverb");
      }
    },
    Channel: class extends MockNode {
      constructor() {
        super("Channel");
      }
    },
    Chorus: class extends MockNode {
      constructor() {
        super("Chorus");
      }
    },
    Sampler,
    Transport,
    getTransport: () => Transport,
    Time: () => ({ toSeconds: () => 0.5 }),
    start: async () => {},
    context: { lookAhead: 0.1, state: "running" },
  };
});

let audio;
beforeEach(async () => {
  live.clear();
  built.length = 0;
  global.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.resetModules();
  audio = await import("../audio.js");
});
afterEach(() => {
  delete global.fetch;
});

describe("audio graph lifecycle", () => {
  it("builds exactly one limiter and one reverb", async () => {
    await audio.initSynths();
    expect(countLive("Limiter")).toBe(1);
    expect(countLive("Reverb")).toBe(1);
  });

  it("is idempotent: a second init does not orphan the first graph", async () => {
    await audio.initSynths();
    const firstLimiter = built.find((node) => node.kind === "Limiter");
    const firstReverb = built.find((node) => node.kind === "Reverb");

    await audio.initSynths();

    // Previously both were replaced by new nodes while the originals stayed
    // connected to the destination and were never disposed.
    expect(firstLimiter.disposed, "the first limiter should have been disposed").toBe(true);
    expect(firstReverb.disposed, "the first reverb should have been disposed").toBe(true);
    expect(countLive("Limiter")).toBe(1);
    expect(countLive("Reverb")).toBe(1);
  });

  it("disposeAudio leaves no live node behind", async () => {
    await audio.initSynths();
    expect(live.size).toBeGreaterThan(0);

    audio.disposeAudio();

    const survivors = [...live].map((node) => node.kind);
    expect(survivors, `nodes still live after disposeAudio: ${survivors.join(", ")}`).toEqual([]);
  });

  it("survives repeated init/dispose cycles without accumulating nodes", async () => {
    for (let i = 0; i < 3; i += 1) {
      await audio.initSynths();
      audio.disposeAudio();
    }
    expect(live.size).toBe(0);
    expect(built.length).toBeGreaterThan(0);
  });
});

describe("scheduled event ownership", () => {
  const notes = (count, part) =>
    Array.from({ length: count }, (_, i) => ({
      startBeats: i,
      swingPosition: 0,
      note: part === "left" ? "C3" : "C5",
      duration: "4n",
      dynamics: { accent: 0, ghost: 0 },
    }));

  let Tone;
  beforeEach(async () => {
    Tone = await import("tone");
    await audio.initSynths();
    Tone.Transport.scheduled.clear();
  });

  it("re-playing a part replaces its events instead of stacking duplicates", () => {
    audio.playFromEvents(notes(4, "left"), audio.synths.left, 4, false, "left");
    expect(Tone.Transport.scheduled.size).toBe(4);

    // Previously this stacked a second copy: playFromEvents scheduled without
    // cancelling, and only worked because callers stopped the transport first.
    audio.playFromEvents(notes(4, "left"), audio.synths.left, 4, false, "left");
    expect(Tone.Transport.scheduled.size).toBe(4);
  });

  it("replacing one part leaves the other part's events intact", () => {
    audio.playFromEvents(notes(3, "left"), audio.synths.left, 4, false, "left");
    audio.playFromEvents(notes(2, "lead"), audio.synths.lead, 4, false, "lead");
    expect(Tone.Transport.scheduled.size).toBe(5);

    // Re-play only the left hand. The lead's two events must survive; before,
    // the only cancellation available was a global Transport.cancel().
    audio.playFromEvents(notes(3, "left"), audio.synths.left, 4, false, "left");
    expect(Tone.Transport.scheduled.size).toBe(5);
  });

  it("stopTransport clears everything", () => {
    audio.playFromEvents(notes(3, "left"), audio.synths.left, 4, false, "left");
    audio.playFromEvents(notes(2, "lead"), audio.synths.lead, 4, false, "lead");

    audio.stopTransport();
    expect(Tone.Transport.scheduled.size).toBe(0);

    // And the bookkeeping is empty too, so the next play starts from a clean slate.
    audio.playFromEvents(notes(2, "lead"), audio.synths.lead, 4, false, "lead");
    expect(Tone.Transport.scheduled.size).toBe(2);
  });
});
