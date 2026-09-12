// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { CoachApp } from "../coach/CoachApp.tsx";
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

function createFakeBridge({ assignment, sampler = READY, unlock = true, midiEnvironment } = {}) {
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
    openAssignmentDrawer: vi.fn(),
    getKeyboardElement: () => keyboard,
    keyboard,
    noteInput,
    midiInput,
    fakeMidi,
    setMidiPlayThrough: vi.fn(async (enabled) => midiInput.setPlayThrough(enabled)),
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
beforeEach(() => {
  // jsdom does not run animation frames; the playhead loop only needs to be callable.
  vi.stubGlobal("requestAnimationFrame", () => 1);
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
    await click(screen.getByRole("button", { name: "Right hand" }));

    const [first, second] = bridge.audioEngine.sessions;
    expect(first.stop).toHaveBeenCalled();
    expect(second.request).toMatchObject({ parts: ["rh"], countIn: false });
  });

  it("does not start when the browser keeps audio blocked", async () => {
    bridge = createFakeBridge({ assignment: cMajor, unlock: false });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Start 5 minutes" }));

    expect(bridge.audioEngine.play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start 5 minutes" })).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("runs a five-minute session that pauses, resumes and stops playback at zero", async () => {
    vi.useFakeTimers();
    bridge = createFakeBridge({ assignment: cMajor });
    render(<CoachApp bridge={bridge} summaryContainer={null} />);

    await click(screen.getByRole("button", { name: "Start 5 minutes" }));
    expect(screen.getByRole("timer").textContent).toBe("5:00");
    expect(bridge.audioEngine.requests[0].countIn).toBe(true);

    await act(async () => vi.advanceTimersByTime(61_000));
    expect(screen.getByRole("timer").textContent).toBe("3:59");

    await click(screen.getByRole("button", { name: "Pause" }));
    expect(bridge.audioEngine.sessions[0].stop).toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("timer").textContent).toBe("3:59");

    await click(screen.getByRole("button", { name: "Resume" }));
    await act(async () => vi.advanceTimersByTime(240_000));

    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("Five minutes done.")).toBeTruthy();
    expect(bridge.audioEngine.sessions.at(-1).stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
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
    expect(bridge.openAssignmentDrawer).toHaveBeenCalled();
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
