import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.js";

// A minimal Tone double that records every node ever constructed and whether it
// was disposed, so leaks are observable rather than inferred.
const live = new Set();
const built = [];
const samplerOutcomes = [];
const samplerOptions = [];

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
      samplerOptions.push(options);
      // Tone loads asynchronously; resolve on a microtask like the real thing.
      const outcome = samplerOutcomes.shift() || "load";
      queueMicrotask(() => {
        if (outcome === "error") {
          options?.onerror?.(new Error("simulated sampler failure"));
        } else {
          options?.onload?.();
        }
      });
    }
  }
  let nextEventId = 1;
  const Transport = {
    PPQ: 192,
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
    Ticks: (value) => ({ ticks: value, toTicks: () => value, valueOf: () => value }),
    Time: () => ({ toSeconds: () => 0.5 }),
    start: async () => {},
    context: { lookAhead: 0.1, state: "running" },
    getContext: () => ({ decodeAudioData: async (bytes) => ({ decodedFrom: bytes }) }),
  };
});

let audio;
beforeEach(async () => {
  live.clear();
  built.length = 0;
  samplerOutcomes.length = 0;
  samplerOptions.length = 0;
  global.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.resetModules();
  audio = await import("../audio.js");
});
afterEach(() => {
  delete global.fetch;
});

describe("audio graph lifecycle", () => {
  it("builds exactly one limiter and one reverb", async () => {
    await audio.audioEngine.init();
    expect(countLive("Limiter")).toBe(1);
    expect(countLive("Reverb")).toBe(1);
  });

  it("is idempotent: a second init does not orphan the first graph", async () => {
    await audio.audioEngine.init();
    const firstLimiter = built.find((node) => node.kind === "Limiter");
    const firstReverb = built.find((node) => node.kind === "Reverb");

    await audio.audioEngine.init();

    // Previously both were replaced by new nodes while the originals stayed
    // connected to the destination and were never disposed.
    expect(firstLimiter.disposed, "the first limiter should have been disposed").toBe(true);
    expect(firstReverb.disposed, "the first reverb should have been disposed").toBe(true);
    expect(countLive("Limiter")).toBe(1);
    expect(countLive("Reverb")).toBe(1);
  });

  it("disposeAudio leaves no live node behind", async () => {
    await audio.audioEngine.init();
    expect(live.size).toBeGreaterThan(0);

    audio.audioEngine.dispose();

    const survivors = [...live].map((node) => node.kind);
    expect(survivors, `nodes still live after disposeAudio: ${survivors.join(", ")}`).toEqual([]);
  });

  it("survives repeated init/dispose cycles without accumulating nodes", async () => {
    for (let i = 0; i < 3; i += 1) {
      await audio.audioEngine.init();
      audio.audioEngine.dispose();
    }
    expect(live.size).toBe(0);
    expect(built.length).toBeGreaterThan(0);
  });

  it("downloads and decodes each sample once, and shares the decoded audio with every part", async () => {
    await audio.audioEngine.init();

    const fetched = global.fetch.mock.calls.map(([url]) => url);
    expect(new Set(fetched).size).toBe(fetched.length);
    expect(fetched).toHaveLength(16);

    // Both part samplers receive decoded buffers, not URLs to fetch again.
    const defaultSamplers = samplerOptions.slice(0, 2);
    expect(defaultSamplers).toHaveLength(2);
    for (const options of defaultSamplers) {
      expect(options.baseUrl).toBe("");
      expect(Object.values(options.urls).every((buffer) => typeof buffer === "object")).toBe(true);
    }
    expect(defaultSamplers[0].urls.A4).toBe(defaultSamplers[1].urls.A4);
  });

  it("reports a failed sample download without constructing samplers", async () => {
    global.fetch = vi.fn(async (url) => ({
      ok: !url.endsWith("c4vl.mp3"),
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    await expect(audio.requestLibraryLoad("local-soft")).rejects.toThrow("Failed to fetch c4vl.mp3");
    expect(countLive("Sampler")).toBe(0);
  });

  it("disposes a successful part when its sibling sampler load fails", async () => {
    await audio.audioEngine.init();
    const initialSamplerCount = built.filter((node) => node.kind === "Sampler").length;

    // Fuhton constructs low/high layers for left, then low/high for lead. Let
    // the left part finish before the lead part fails. Promise.all used to lose
    // ownership of the already-successful left sampler here.
    samplerOutcomes.push("load", "load", "load", "error");

    await expect(audio.requestLibraryLoad("fuhton-piano")).rejects.toThrow("simulated sampler failure");

    const failedLibraryNodes = built
      .filter((node) => node.kind === "Sampler")
      .slice(initialSamplerCount, initialSamplerCount + 4);
    expect(failedLibraryNodes).toHaveLength(4);
    expect(failedLibraryNodes.every((node) => node.disposed)).toBe(true);

    // The existing two single-layer default samplers remain active.
    expect(countLive("Sampler")).toBe(2);
  });
});

describe("Tone playback adapter", () => {
  it("keeps scheduled positions in beats when tempo changes", async () => {
    const Tone = await import("tone");
    await audio.audioEngine.init();
    const score = buildScore(
      generateAssignment({
        ...DEFAULT_ASSIGNMENT_INPUTS,
        length: 4,
        seed: "beat-domain-scheduling",
      }),
    );
    const request = {
      score,
      parts: ["lh"],
      barRange: [0, 0],
      rate: 1,
      loop: true,
      countIn: false,
      tempoBpm: 60,
    };

    const first = audio.audioEngine.play(request);
    const atSixty = [...Tone.Transport.scheduled.values()].map(({ when }) => when.ticks);
    first.stop();

    const second = audio.audioEngine.play({ ...request, tempoBpm: 120 });
    const atOneTwenty = [...Tone.Transport.scheduled.values()].map(({ when }) => when.ticks);
    second.stop();

    // The former adapter scheduled absolute seconds, so changing BPM after
    // event creation moved notes off their intended beat grid.
    expect(atOneTwenty).toEqual(atSixty);
    expect(atSixty.every(Number.isFinite)).toBe(true);
  });
});
