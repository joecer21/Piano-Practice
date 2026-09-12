import { describe, expect, it, vi } from "vitest";
import { createNoteInputHub } from "../input/note-input.ts";
import { EMPTY_HELD_NOTES, playedNotes, reduceHeldNotes, soundingChanges } from "../input/held-notes.ts";

const on = (midi, source = "pointer", velocity = 0.8) => ({ type: "noteOn", midi, velocity, source });
const off = (midi, source = "pointer") => ({ type: "noteOff", midi, source });
const pedal = (down, source = "midi") => ({ type: "sustain", down, source });
const run = (...events) => events.reduce(reduceHeldNotes, EMPTY_HELD_NOTES);

describe("note input hub", () => {
  it("delivers every event to every subscriber until they unsubscribe", () => {
    const hub = createNoteInputHub();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = hub.subscribe(first);
    hub.subscribe(second);

    hub.emit(on(60));
    unsubscribe();
    hub.emit(off(60));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second.mock.calls.map(([event]) => event.type)).toEqual(["noteOn", "noteOff"]);
  });

  it("rejects malformed events rather than passing them downstream", () => {
    const hub = createNoteInputHub();
    expect(() => hub.emit(on(128))).toThrow(RangeError);
    expect(() => hub.emit(on(60, "pointer", 2))).toThrow(RangeError);
    expect(() => hub.emit({ type: "noteOn", midi: 60, velocity: 1, source: "tablet" })).toThrow(TypeError);
  });

  it("keeps delivering when one listener throws", () => {
    const hub = createNoteInputHub();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const survivor = vi.fn();
    hub.subscribe(() => {
      throw new Error("broken listener");
    });
    hub.subscribe(survivor);
    hub.emit(on(60));
    expect(survivor).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalled();
  });
});

describe("held notes", () => {
  it("tracks notes held by each source independently", () => {
    const state = run(on(60, "pointer"), on(60, "midi"), off(60, "pointer"));
    expect(playedNotes(state)).toEqual(new Map([[60, "held"]]));
    expect(playedNotes(state, ["pointer"]).size).toBe(0);
  });

  it("keeps a released note ringing while that source's pedal is down", () => {
    const state = run(pedal(true), on(64, "midi"), off(64, "midi"));
    expect(playedNotes(state)).toEqual(new Map([[64, "sustained"]]));
    expect(playedNotes(reduceHeldNotes(state, pedal(false)))).toEqual(new Map());
  });

  it("does not let the MIDI pedal sustain notes from other sources", () => {
    const state = run(pedal(true, "midi"), on(60, "pointer"), off(60, "pointer"));
    expect(playedNotes(state).size).toBe(0);
  });

  it("makes a re-struck sustained note held again, and held notes survive pedal-up", () => {
    let state = run(pedal(true), on(67, "midi"), off(67, "midi"), on(67, "midi"));
    expect(playedNotes(state).get(67)).toBe("held");
    state = reduceHeldNotes(state, pedal(false));
    expect(playedNotes(state).get(67)).toBe("held");
  });

  it("releases everything from one source on all-notes-off, including the pedal", () => {
    const state = run(on(60, "pointer"), pedal(true), on(62, "midi"), off(62, "midi"), on(64, "midi"), {
      type: "allNotesOff",
      source: "midi",
    });
    expect(playedNotes(state)).toEqual(new Map([[60, "held"]]));
    expect(playedNotes(reduceHeldNotes(state, off(71, "midi"))).has(71)).toBe(false);
  });

  it("ignores a note-off for a note that was never held", () => {
    const state = run(on(60));
    expect(reduceHeldNotes(state, off(61))).toBe(state);
  });

  it("reports which notes started and stopped sounding between states", () => {
    const before = playedNotes(run(on(60), on(64)));
    const after = playedNotes(run(on(64), on(67)));
    expect(soundingChanges(before, after)).toEqual({ started: [67], stopped: [60] });
  });
});
