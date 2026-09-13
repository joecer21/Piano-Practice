// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { CoachApp } from "../coach/CoachApp.tsx";
import { chordShapeMidis } from "../coach/views.ts";
import { noteStringToMidi } from "../theory.js";
import { createNoteInputHub } from "../input/note-input.ts";
import { createMidiInput } from "../input/midi.ts";

function assignmentFor(inputs) {
  const generated = generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, ...inputs });
  return { score: buildScore(generated), leftHand: generated.leftHand, motif: generated.motif };
}

const READY = {
  activeLibraryId: "local-soft",
  libraries: { "local-soft": { label: "Piano Lite", phase: "ready" } },
};
const LOADING = {
  activeLibraryId: "local-soft",
  libraries: { "local-soft": { label: "Piano Lite", phase: "progress", progress: 0.4 } },
};

/** A fake engine that records requests and lets the test end sessions from outside. */
function createFakeEngine() {
  const listeners = new Set();
  let next = 1;
  const engine = {
    requests: [],
    sessions: [],
    positionBeats: 0,
    play: vi.fn((request) => {
      const session = {
        id: `s${next++}`,
        request,
        status: "playing",
        stop: vi.fn(() => {
          session.status = "stopped";
        }),
      };
      engine.requests.push(request);
      engine.sessions.push(session);
      return session;
    }),
    on: vi.fn((type, listener) => {
      if (type !== "status") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    getSnapshot: () => ({ state: "started", positionBeats: engine.positionBeats }),
    emitStatus: (event) => listeners.forEach((listener) => listener(event)),
  };
  return engine;
}

function createFakeMidiAccess() {
  const inputs = new Map();
  const access = { inputs: { forEach: (callback) => inputs.forEach(callback) }, onstatechange: null };
  return {
    access,
    plug(id, name) {
      inputs.set(id, { id, name, state: "connected", onmidimessage: null });
      access.onstatechange?.({ port: { type: "input" } });
    },
    send(id, ...bytes) {
      inputs.get(id).onmidimessage?.({ data: Uint8Array.from(bytes) });
    },
  };
}

const STARRED_ENTRY = {
  fragment: "v=1&key=A&mode=minorBlues",
  inputs: {},
  title: "A minor blues · 12-Bar Minor Blues · Blues Riff - minor blues ♭5",
  starredAt: "2026-03-01T12:00:00.000Z",
};

/** A fake practice library: records calls and keeps a stable snapshot. */
function createFakeLibrary({
  preferences = { labelMode: "degrees", sessionLength: 300 },
  starred = [],
} = {}) {
  const listeners = new Set();
  const prefs = { ...preferences };
  let snapshot = { starred, currentStarred: false };
  const publish = (next) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentShareUrl: () => "https://example.test/app/#v=1&key=C&mode=major",
    currentTitle: () => "C major · Pop 4 · Pop Hook - 1 3 5 1",
    toggleStarCurrent: vi.fn(() => publish({ ...snapshot, currentStarred: !snapshot.currentStarred })),
    open: vi.fn(() => true),
    unstar: vi.fn((fragment) =>
      publish({ ...snapshot, starred: snapshot.starred.filter((entry) => entry.fragment !== fragment) }),
    ),
    preferences: () => ({ ...prefs }),
    setPreference: vi.fn((name, value) => {
      prefs[name] = value;
    }),
  };
}

function createFakeBridge({
  assignment,
  sampler = READY,
  unlock = true,
  midiEnvironment,
  library = createFakeLibrary(),
} = {}) {
  const noteInput = createNoteInputHub();
  const fakeMidi = createFakeMidiAccess();
  const midiInput = createMidiInput(
    noteInput,
    midiEnvironment ?? {
      isSecureContext: true,
      navigator: { requestMIDIAccess: async () => fakeMidi.access },
    },
  );
  const assignmentListeners = new Set();
  const samplerListeners = new Set();
  const keyboard = document.createElement("div");
  ["A3", "C4", "E4", "C#4"].forEach((note) => {
    const key = document.createElement("button");
    key.className = "piano-key";
    key.dataset.note = note;
    keyboard.append(key);
  });
  let current = assignment;
  let snapshot = sampler;
  const editorListeners = new Set();
  const editorSnapshot = {
    inputs: { ...DEFAULT_ASSIGNMENT_INPUTS, customProgressionRoman: [] },
    locks: { key: false, harmony: false, groove: false, motif: false },
    assignmentId: "assignment-test",
    seed: "coach-test",
    canUndo: false,
    canRedo: false,
  };
  const successfulEdit = { ok: true, message: "Assignment updated" };
  const bridge = {
    audioEngine: createFakeEngine(),
    getAssignment: () => current,
    subscribeAssignment: (listener) => {
      assignmentListeners.add(listener);
      return () => assignmentListeners.delete(listener);
    },
    getSamplerSnapshot: () => snapshot,
    subscribeSampler: (listener) => {
      samplerListeners.add(listener);
      return () => samplerListeners.delete(listener);
    },
    getTempoBpm: () => 90,
    unlockAudio: vi.fn(async () => unlock),
    stopOtherPlayback: vi.fn(),
    reportError: vi.fn(),
    getKeyboardElement: () => keyboard,
    keyboard,
    noteInput,
    midiInput,
    fakeMidi,
    setMidiPlayThrough: vi.fn(async (enabled) => midiInput.setPlayThrough(enabled)),
    assignmentEditor: {
      getSnapshot: () => editorSnapshot,
      subscribe: (listener) => {
        editorListeners.add(listener);
        return () => editorListeners.delete(listener);
      },
      apply: vi.fn(() => successfulEdit),
      applyPreset: vi.fn(() => successfulEdit),
      reroll: vi.fn(() => successfulEdit),
      undo: vi.fn(() => successfulEdit),
      redo: vi.fn(() => successfulEdit),
      toggleLock: vi.fn(),
    },
    library,
    setAssignment(nextAssignment) {
      current = nextAssignment;
      assignmentListeners.forEach((listener) => listener());
    },
    setSampler(nextSnapshot) {
      snapshot = nextSnapshot;
      samplerListeners.forEach((listener) => listener());
    },
  };
  return bridge;
}

const click = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

let bridge;
let frames = [];
/**
 * Run animation frames at a given transport position, as the browser would. Under
 * fake timers Vitest also fakes requestAnimationFrame, so frames come from
 * advancing fake time; otherwise they come from the manual queue below.
 */
const frame = async (positionBeats) => {
  bridge.audioEngine.positionBeats = positionBeats;
  if (vi.isFakeTimers()) {
    await act(async () => vi.advanceTimersByTime(50));
    return;
  }
  const pending = frames;
  frames = [];
  await act(async () => pending.forEach((callback) => callback(0)));
};
beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CoachApp", () => {
  const cMajor = assignmentFor({ key: "C", mode: "major", progressionPresetId: "pop-4", seed: "coach-app" });

  it("leads with one sentence and one start button, disabled until the piano is ready", async () => {
    bridge = createFakeBridge({ assignment: cMajor, sampler: LOADING });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    expect(screen.getByTestId("coach-sentence").textContent).toMatch(/^C major\. I–V–vi–IV\./);
    const start = screen.getByRole("button", { name: "Start 5 minutes" });
    expect(start.disabled).toBe(true);
    expect(screen.getByText("Loading Piano Lite 40%")).toBeTruthy();

    await act(async () => bridge.setSampler(READY));
    expect(start.disabled).toBe(false);
  });

  it("plays loop bar 3, left hand only, at half speed as one request", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Hands apart" }));
    await click(screen.getByRole("button", { name: /^Bar 3,/ }));
    await click(screen.getByRole("button", { name: "Left hand" }));
    await click(screen.getByRole("button", { name: "Half speed" }));
    await click(screen.getByRole("button", { name: "Play" }));

    expect(bridge.stopOtherPlayback).toHaveBeenCalled();
    expect(bridge.audioEngine.requests).toHaveLength(1);
    expect(bridge.audioEngine.requests[0]).toMatchObject({
      parts: ["lh"],
      barRange: [2, 2],
      rate: 0.5,
      loop: true,
      countIn: true,
      tempoBpm: 90,
    });
    expect(screen.getByRole("button", { name: "Stop" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("restarts immediately without a second count-in when the hands change mid-play", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Play" }));
    await click(screen.getByRole("button", { name: "Hands apart" }));
    await click(screen.getByRole("button", { name: "Right hand" }));

    const sessions = bridge.audioEngine.sessions;
    expect(sessions[0].stop).toHaveBeenCalled();
    expect(sessions[1].request).toMatchObject({ parts: ["lh"], countIn: false });
    expect(sessions.at(-1).request).toMatchObject({ parts: ["rh"], countIn: false });
  });

  it("does not start when the browser keeps audio blocked", async () => {
    bridge = createFakeBridge({ assignment: cMajor, unlock: false });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Start 5 minutes" }));

    expect(bridge.audioEngine.play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start 5 minutes" })).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("guides a session step by step, changing step only on a bar line", async () => {
    vi.useFakeTimers();
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(screen.getByRole("timer").textContent).toBe("5:00");
    expect(bridge.audioEngine.requests[0]).toMatchObject({ parts: ["lh", "rh"], countIn: true });
    expect(screen.getByText(/Listen once through/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "The whole thing" }).getAttribute("aria-pressed")).toBe("true");

    // The first step's minute is up, but the music is mid-bar: nothing changes yet.
    await frame(4.5); // past the count-in, half a beat into bar 1
    await act(async () => vi.advanceTimersByTime(61_000));
    expect(screen.getByText(/Moving on at the next bar/)).toBeTruthy();
    expect(bridge.audioEngine.requests).toHaveLength(1);

    // Crossing into bar 2 moves on: left hand alone, restarted without a count-in.
    await frame(8.25);
    expect(screen.getByText(/Left hand alone/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hands apart" }).getAttribute("aria-pressed")).toBe("true");
    expect(bridge.audioEngine.requests.at(-1)).toMatchObject({ parts: ["lh"], countIn: false });

    await click(screen.getByRole("button", { name: "Pause" }));
    expect(bridge.audioEngine.sessions.at(-1).stop).toHaveBeenCalled();
    const paused = screen.getByRole("timer").textContent;
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("timer").textContent).toBe(paused);

    await click(screen.getByRole("button", { name: "Resume" }));
    expect(bridge.audioEngine.requests.at(-1)).toMatchObject({ parts: ["lh"], countIn: true });
  });

  it("moves on at once when nothing is playing, since there is no bar line to wait for", async () => {
    vi.useFakeTimers();
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Start 5 minutes" }));
    await click(screen.getByRole("button", { name: "Stop" }));
    await act(async () => vi.advanceTimersByTime(61_000));

    expect(screen.getByText(/Left hand alone/)).toBeTruthy();
  });

  it("finishes with a summary and offers the same assignment or a new key", async () => {
    vi.useFakeTimers();
    const dMajor = assignmentFor({
      key: "D",
      mode: "major",
      progressionPresetId: "pop-4",
      seed: "coach-app",
    });
    bridge = createFakeBridge({ assignment: cMajor });
    bridge.rerollIntoNewKey = vi.fn(() => {
      bridge.setAssignment(dMajor);
      return true;
    });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Start 5 minutes" }));
    await act(async () => vi.advanceTimersByTime(20_000));
    for (let step = 0; step < 5; step += 1) await click(screen.getByRole("button", { name: "Next step" }));
    await click(screen.getByRole("button", { name: "Finish" }));

    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("5 minutes done.")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "What you covered" })).getByText(/The whole thing/),
    ).toBeTruthy();
    expect(bridge.audioEngine.sessions.at(-1).stop).toHaveBeenCalled();

    const playsBefore = bridge.audioEngine.requests.length;
    await click(screen.getByRole("button", { name: "Again in a new key" }));
    expect(bridge.rerollIntoNewKey).toHaveBeenCalled();
    expect(screen.getByTestId("coach-sentence").textContent).toMatch(/^D major/);
    expect(screen.getByRole("timer").textContent).toBe("5:00");
    expect(bridge.audioEngine.requests.length).toBe(playsBefore + 1);
    expect(bridge.audioEngine.requests.at(-1).countIn).toBe(true);
  });

  it("offers two, ten and untimed sessions, and an untimed one never ends on its own", async () => {
    vi.useFakeTimers();
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Session length"), { target: { value: "untimed" } });
    });
    await click(screen.getByRole("button", { name: "Start practising" }));
    await click(screen.getByRole("button", { name: "Stop" }));
    await act(async () => vi.advanceTimersByTime(20 * 60_000));

    expect(screen.getByRole("timer", { name: "Time practised" }).textContent).toBe("20:00");
    expect(screen.getByText(/Listen once through/)).toBeTruthy();
  });

  it("chord by chord marks the voicing's keys, dims the rest, and steps through chords", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    await click(screen.getByRole("button", { name: "Chord by chord" }));

    const shape = new Set(chordShapeMidis(cMajor.score.bars[0]));
    bridge.keyboard.querySelectorAll(".piano-key").forEach((key) => {
      expect(key.dataset.shape === "true", key.dataset.note).toBe(
        shape.has(noteStringToMidi(key.dataset.note)),
      );
    });
    const key = (note) => bridge.keyboard.querySelector(`[data-note="${note}"]`);
    expect(key("C#4").dataset.dimmed).toBe("true");
    expect(key("C4").dataset.dimmed).toBeUndefined();
    expect(screen.getByText("Chord 1 of 8")).toBeTruthy();
    expect(screen.getByText("I — home. Every phrase can land here.")).toBeTruthy();

    await click(screen.getByRole("button", { name: "Next chord" }));
    expect(screen.getByText("Chord 2 of 8")).toBeTruthy();
    expect(screen.getByText("V — the strongest pull back to home.")).toBeTruthy();

    await click(screen.getByRole("button", { name: "The whole thing" }));
    expect(bridge.keyboard.querySelectorAll("[data-shape], [data-dimmed]")).toHaveLength(0);
  });

  it("note by note shows the motif in degrees and plays it with the right hand at half speed", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    await click(screen.getByRole("button", { name: "Note by note" }));

    const motif = screen.getByRole("list", { name: /Motif degrees/ });
    expect([...motif.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["1", "3", "5", "1"]);
    expect(screen.getByText("The motif climbs and lands.")).toBeTruthy();

    await click(screen.getByRole("button", { name: "Play" }));
    expect(bridge.audioEngine.requests.at(-1)).toMatchObject({ parts: ["rh"], rate: 0.5, loop: true });
  });

  it("note by note names a borrowed colour tone rather than hiding or replacing it", async () => {
    bridge = createFakeBridge({
      assignment: assignmentFor({
        key: "A",
        mode: "pentatonicMinor",
        motifId: "step-arch",
        seed: "borrowed",
      }),
    });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    await click(screen.getByRole("button", { name: "Note by note" }));

    const chips = [...screen.getByRole("list", { name: /Motif degrees/ }).querySelectorAll("li")];
    expect(chips.map((li) => li.textContent)).toEqual([
      "1",
      "2 (borrowed)",
      "♭3",
      "♭10",
      "♭3",
      "2 (borrowed)",
      "1",
      "1",
    ]);
    expect(chips.filter((li) => li.dataset.membership === "parentScale")).toHaveLength(2);
    expect(screen.getByText("2 is borrowed from natural minor, outside pentatonic minor.")).toBeTruthy();
  });

  it("stars the assignment and shares its link, falling back to a copyable field", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    const star = screen.getByRole("button", { name: "☆ Star" });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    await click(star);
    expect(bridge.library.toggleStarCurrent).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "★ Starred" }).getAttribute("aria-pressed")).toBe("true");

    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    await click(screen.getByRole("button", { name: "Share link" }));
    expect(writeText).toHaveBeenCalledWith("https://example.test/app/#v=1&key=C&mode=major");
    expect(screen.getByRole("status").textContent).toBe("Link copied.");

    vi.stubGlobal("navigator", {
      ...navigator,
      share: undefined,
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    await click(screen.getByRole("button", { name: "Share link" }));
    expect(screen.getByLabelText("Copy this link:").value).toBe(
      "https://example.test/app/#v=1&key=C&mode=major",
    );
  });

  it("uses the share sheet where the device has one", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share });
    await click(screen.getByRole("button", { name: "Share link" }));
    expect(share).toHaveBeenCalledWith({
      title: "C major · Pop 4 · Pop Hook - 1 3 5 1",
      url: "https://example.test/app/#v=1&key=C&mode=major",
    });
  });

  it("reopens and removes starred assignments, but not in the middle of a session", async () => {
    vi.useFakeTimers();
    bridge = createFakeBridge({
      assignment: cMajor,
      library: createFakeLibrary({ starred: [STARRED_ENTRY] }),
    });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    const list = screen.getByRole("list", { name: "Starred assignments" });
    expect(within(list).getByText(STARRED_ENTRY.title)).toBeTruthy();
    const open = within(list).getByRole("button", { name: `Open ${STARRED_ENTRY.title}` });
    await click(open);
    expect(bridge.library.open).toHaveBeenCalledWith(STARRED_ENTRY.fragment);

    await click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(open.disabled).toBe(true);
    expect(screen.getByText(/Finish or end the session/)).toBeTruthy();
    await click(screen.getByRole("button", { name: "End session" }));
    expect(open.disabled).toBe(false);

    await click(within(list).getByRole("button", { name: `Remove ${STARRED_ENTRY.title} from starred` }));
    expect(bridge.library.unstar).toHaveBeenCalledWith(STARRED_ENTRY.fragment);
    expect(screen.queryByRole("list", { name: "Starred assignments" })).toBeNull();
  });

  it("remembers degrees or letters, and the session length", async () => {
    const library = createFakeLibrary({ preferences: { labelMode: "letters", sessionLength: 600 } });
    bridge = createFakeBridge({ assignment: cMajor, library });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    expect(screen.getByRole("button", { name: "Letters" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Start 10 minutes" })).toBeTruthy();

    await click(screen.getByRole("button", { name: "Degrees" }));
    expect(library.setPreference).toHaveBeenCalledWith("labelMode", "degrees");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Session length"), { target: { value: "120" } });
    });
    expect(library.setPreference).toHaveBeenCalledWith("sessionLength", 120);
  });

  it("says so when there is no motif, and cannot play one", async () => {
    bridge = createFakeBridge({ assignment: assignmentFor({ motifId: "none", seed: "no-motif" }) });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    await click(screen.getByRole("button", { name: "Note by note" }));
    expect(screen.getByText(/has no motif/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" }).disabled).toBe(true);
  });

  it("reflects playback stopped from outside the coach", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Play" }));
    const session = bridge.audioEngine.sessions[0];
    await act(async () => bridge.audioEngine.emitStatus({ sessionId: session.id, status: "stopped" }));

    expect(screen.getByRole("button", { name: "Play" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("stops playback and drops a bar selection that no longer exists when the assignment changes", async () => {
    bridge = createFakeBridge({ assignment: assignmentFor({ length: 8, seed: "long" }) });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: /^Bar 8,/ }));
    await click(screen.getByRole("button", { name: "Play" }));
    const session = bridge.audioEngine.sessions[0];

    const short = assignmentFor({ progressionPresetId: "pop-4", length: 4, seed: "short" });
    expect(short.score.meta.bars).toBeLessThan(8);
    await act(async () => bridge.setAssignment(short));

    expect(session.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByText("Select a bar to practice it on its own.")).toBeTruthy();
  });

  it("teaches the selected bar on the keyboard", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    const key = (note) => bridge.keyboard.querySelector(`[data-note="${note}"]`);

    expect(key("C4").dataset.role).toBe("root");

    const aMinorBar = cMajor.score.bars.findIndex((bar) => bar.chordSymbol === "Am");
    await click(screen.getByRole("button", { name: new RegExp(`^Bar ${aMinorBar + 1},`) }));
    expect(key("A3").dataset.role).toBe("root");
    expect(key("C4").dataset.role).toBe("chordTone");

    await click(
      within(screen.getByRole("group", { name: "Key labels" })).getByRole("button", { name: "Letters" }),
    );
    expect(key("A3").querySelector(".key-label").textContent).toBe("A");
  });

  it("opens the assignment drawer on request", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    await click(screen.getByRole("button", { name: "Change the assignment" }));
    expect(document.getElementById("assignment-workspace").open).toBe(true);
    expect(screen.getByRole("heading", { name: "Build the next assignment" })).toBeTruthy();
  });

  it("mirrors what the player plays as a ring, never as a hand colour", async () => {
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);
    const key = (note) => bridge.keyboard.querySelector(`[data-note="${note}"]`);

    await act(async () =>
      bridge.noteInput.emit({ type: "noteOn", midi: 60, velocity: 0.8, source: "pointer" }),
    );
    expect(key("C4").dataset.played).toBe("held");
    expect(key("C4").classList.contains("lh") || key("C4").classList.contains("rh")).toBe(false);

    await act(async () => bridge.noteInput.emit({ type: "noteOff", midi: 60, source: "pointer" }));
    expect(key("C4").dataset.played).toBeUndefined();
  });

  it("connects a MIDI keyboard on request, mirrors it including the pedal, and offers play-through", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} inputContainer={container} />);
    const key = (note) => bridge.keyboard.querySelector(`[data-note="${note}"]`);

    await click(within(container).getByRole("button", { name: "Connect MIDI keyboard" }));
    expect(within(container).getByText(/No MIDI keyboard found/)).toBeTruthy();

    await act(async () => bridge.fakeMidi.plug("piano", "Stage Piano"));
    expect(within(container).getByText("Mirroring Stage Piano")).toBeTruthy();

    await act(async () => {
      bridge.fakeMidi.send("piano", 0xb0, 64, 127);
      bridge.fakeMidi.send("piano", 0x90, 64, 100);
      bridge.fakeMidi.send("piano", 0x80, 64, 0);
    });
    expect(key("E4").dataset.played).toBe("sustained");
    await act(async () => bridge.fakeMidi.send("piano", 0xb0, 64, 0));
    expect(key("E4").dataset.played).toBeUndefined();

    const playThrough = within(container).getByRole("button", { name: "Play through the app" });
    expect(playThrough.getAttribute("aria-pressed")).toBe("false");
    await click(playThrough);
    expect(bridge.setMidiPlayThrough).toHaveBeenCalledWith(true);
    expect(playThrough.getAttribute("aria-pressed")).toBe("true");

    await act(async () => bridge.fakeMidi.send("piano", 0x90, 24, 100));
    expect(within(container).getByText("Playing below the keys shown.")).toBeTruthy();
    container.remove();
  });

  it("explains a browser without Web MIDI in one line and offers no control", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    bridge = createFakeBridge({
      assignment: cMajor,
      midiEnvironment: { isSecureContext: true, navigator: {} },
    });
    render(<CoachApp bridge={bridge} summaryContainer={null} inputContainer={container} />);

    expect(container.textContent).toContain("this browser does not support them");
    expect(within(container).queryByRole("button")).toBeNull();
    container.remove();
  });
});
