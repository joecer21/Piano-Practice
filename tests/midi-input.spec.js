import { describe, expect, it, vi } from "vitest";
import { createNoteInputHub } from "../input/note-input.ts";
import { ALL_INPUTS, createMidiInput, detectMidiSupport, parseMidiMessage } from "../input/midi.ts";

/** A fake MIDIAccess that a test can plug devices into and play. */
function createFakeMidi() {
  const inputs = new Map();
  const access = {
    inputs: { forEach: (callback) => inputs.forEach((input) => callback(input)) },
    onstatechange: null,
  };
  return {
    access,
    plug(id, name = `Keyboard ${id}`, manufacturer = "") {
      const input = { id, name, manufacturer, state: "connected", onmidimessage: null };
      inputs.set(id, input);
      access.onstatechange?.({ port: { type: "input" } });
      return input;
    },
    unplug(id) {
      inputs.get(id).state = "disconnected";
      access.onstatechange?.({ port: { type: "input" } });
    },
    send(id, ...bytes) {
      inputs.get(id).onmidimessage?.({ data: Uint8Array.from(bytes) });
    },
  };
}

function setup({ secure = true, request } = {}) {
  const hub = createNoteInputHub();
  const events = [];
  hub.subscribe((event) => events.push(event));
  const fake = createFakeMidi();
  const requestMIDIAccess = request ?? vi.fn(async () => fake.access);
  const midi = createMidiInput(hub, { isSecureContext: secure, navigator: { requestMIDIAccess } });
  return { hub, events, fake, midi, requestMIDIAccess };
}

describe("parseMidiMessage", () => {
  it.each([
    ["note on", [0x90, 60, 127], { type: "noteOn", midi: 60, velocity: 1, source: "midi" }],
    [
      "note on, any channel",
      [0x9f, 21, 64],
      { type: "noteOn", midi: 21, velocity: 64 / 127, source: "midi" },
    ],
    ["note off", [0x80, 60, 0], { type: "noteOff", midi: 60, source: "midi" }],
    ["note on at velocity zero is a note off", [0x90, 60, 0], { type: "noteOff", midi: 60, source: "midi" }],
    ["sustain down", [0xb0, 64, 127], { type: "sustain", down: true, source: "midi" }],
    ["sustain up", [0xb0, 64, 0], { type: "sustain", down: false, source: "midi" }],
    ["all notes off", [0xb0, 123, 0], { type: "allNotesOff", source: "midi" }],
    ["all sound off", [0xb0, 120, 0], { type: "allNotesOff", source: "midi" }],
  ])("%s", (_label, bytes, expected) => {
    expect(parseMidiMessage(bytes)).toEqual(expected);
  });

  it("ignores messages a mirror has no use for", () => {
    expect(parseMidiMessage([0xf8])).toBeNull(); // clock
    expect(parseMidiMessage([0xa0, 60, 40])).toBeNull(); // aftertouch
    expect(parseMidiMessage([0xb0, 1, 90])).toBeNull(); // mod wheel
    expect(parseMidiMessage(null)).toBeNull();
  });
});

describe("MIDI support detection", () => {
  it("explains Safari, which has no Web MIDI, and insecure pages", () => {
    expect(detectMidiSupport({ isSecureContext: true, navigator: {} })).toBe("unsupported");
    expect(detectMidiSupport({ isSecureContext: false, navigator: { requestMIDIAccess() {} } })).toBe(
      "insecure",
    );
    expect(detectMidiSupport({ isSecureContext: true, navigator: { requestMIDIAccess() {} } })).toBe(
      "available",
    );
  });

  it("never requests permission for an unsupported browser, and connect is a harmless no-op", async () => {
    const hub = createNoteInputHub();
    const midi = createMidiInput(hub, { isSecureContext: true, navigator: {} });
    expect(midi.getState()).toEqual({ status: "unsupported" });
    await expect(midi.connect()).resolves.toBeUndefined();
    expect(midi.getState()).toEqual({ status: "unsupported" });
  });
});

describe("MIDI input adapter", () => {
  it("requests access only when asked, then lists devices and mirrors notes", async () => {
    const { fake, midi, events, requestMIDIAccess } = setup();
    fake.plug("a", "Digital Piano", "Roland");
    expect(midi.getState()).toEqual({ status: "idle" });
    expect(requestMIDIAccess).not.toHaveBeenCalled();

    await midi.connect();

    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    expect(midi.getState()).toEqual({
      status: "connected",
      devices: [{ id: "a", name: "Roland Digital Piano" }],
      selectedId: ALL_INPUTS,
      playThrough: false,
    });
    fake.send("a", 0x90, 60, 100);
    fake.send("a", 0x80, 60, 0);
    expect(events.map((event) => event.type)).toEqual(["noteOn", "noteOff"]);
  });

  it("picks up a keyboard plugged in after connecting", async () => {
    const { fake, midi, events } = setup();
    await midi.connect();
    expect(midi.getState().devices).toEqual([]);

    fake.plug("late");
    expect(midi.getState().devices.map((device) => device.id)).toEqual(["late"]);
    fake.send("late", 0x90, 72, 90);
    expect(events.at(-1)).toMatchObject({ type: "noteOn", midi: 72 });
  });

  it("releases held notes when the keyboard is unplugged mid-note", async () => {
    const { fake, midi, events } = setup();
    fake.plug("a");
    await midi.connect();
    fake.send("a", 0x90, 60, 100);

    fake.unplug("a");

    expect(events.at(-1)).toEqual({ type: "allNotesOff", source: "midi" });
    expect(midi.getState().devices).toEqual([]);
  });

  it("listens only to the selected device, and falls back to all when it disappears", async () => {
    const { fake, midi, events } = setup();
    fake.plug("a");
    fake.plug("b");
    await midi.connect();

    midi.selectInput("b");
    const before = events.length;
    fake.send("a", 0x90, 60, 100);
    expect(events.length).toBe(before);
    fake.send("b", 0x90, 62, 100);
    expect(events.at(-1)).toMatchObject({ type: "noteOn", midi: 62 });

    fake.unplug("b");
    expect(midi.getState().selectedId).toBe(ALL_INPUTS);
    fake.send("a", 0x90, 64, 100);
    expect(events.at(-1)).toMatchObject({ type: "noteOn", midi: 64 });
  });

  it("explains a denied permission and allows another attempt", async () => {
    let allow = false;
    const fake = createFakeMidi();
    const request = vi.fn(async () => {
      if (!allow) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      return fake.access;
    });
    const { midi } = setup({ request });

    await midi.connect();
    expect(midi.getState()).toMatchObject({ status: "denied" });
    expect(midi.getState().message).toMatch(/blocked/);

    allow = true;
    await midi.connect();
    expect(midi.getState().status).toBe("connected");
  });

  it("does not attempt MIDI on an insecure page", async () => {
    const { midi, requestMIDIAccess } = setup({ secure: false });
    await midi.connect();
    expect(midi.getState()).toEqual({ status: "insecure" });
    expect(requestMIDIAccess).not.toHaveBeenCalled();
  });

  it("stops mirroring and releases notes on disconnect", async () => {
    const { fake, midi, events } = setup();
    const input = fake.plug("a");
    await midi.connect();
    midi.setPlayThrough(true);
    expect(midi.getState().playThrough).toBe(true);

    midi.disconnect();

    expect(input.onmidimessage).toBeNull();
    expect(events.at(-1)).toEqual({ type: "allNotesOff", source: "midi" });
    expect(midi.getState()).toEqual({ status: "idle" });
  });
});
