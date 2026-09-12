import type { NoteInputEvent, NoteInputHub } from "./note-input.js";

/* The slice of Web MIDI this adapter uses, typed structurally so tests can supply a fake. */
export type MidiMessageLike = { data: ArrayLike<number> | null };
export type MidiInputLike = {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  onmidimessage: ((event: MidiMessageLike) => void) | null;
};
export type MidiAccessLike = {
  inputs: { forEach(callback: (input: MidiInputLike) => void): void };
  onstatechange: ((event: { port?: { type?: string } | null }) => void) | null;
};
export type MidiEnvironment = {
  isSecureContext?: boolean;
  navigator?: { requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessLike> };
};

export type MidiDevice = { id: string; name: string };
export const ALL_INPUTS = "all";

export type MidiState =
  | { status: "unsupported" }
  | { status: "insecure" }
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "denied"; message: string }
  | {
      status: "connected";
      devices: MidiDevice[];
      selectedId: string;
      /** Send MIDI notes to the app's piano as well as mirroring them. */
      playThrough: boolean;
    };

export type MidiInput = {
  getState(): MidiState;
  subscribe(listener: () => void): () => void;
  /** Must be called from a user gesture: browsers prompt for MIDI permission. */
  connect(): Promise<void>;
  selectInput(id: string): void;
  setPlayThrough(enabled: boolean): void;
  disconnect(): void;
};

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const SUSTAIN_PEDAL = 64;
const ALL_SOUND_OFF = 120;
const ALL_NOTES_OFF = 123;

/**
 * Decode one channel message into a note-input event, on any channel. Returns
 * null for everything a mirror has no use for (clock, aftertouch, sysex, ...).
 */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): NoteInputEvent | null {
  if (!data || data.length < 3) return null;
  const kind = data[0] & 0xf0;
  const first = data[1] & 0x7f;
  const second = data[2] & 0x7f;
  // Many keyboards send note-on with velocity 0 instead of note-off.
  if (kind === NOTE_ON && second > 0) {
    return { type: "noteOn", midi: first, velocity: second / 127, source: "midi" };
  }
  if (kind === NOTE_OFF || kind === NOTE_ON) return { type: "noteOff", midi: first, source: "midi" };
  if (kind === CONTROL_CHANGE && first === SUSTAIN_PEDAL) {
    return { type: "sustain", down: second >= 64, source: "midi" };
  }
  if (kind === CONTROL_CHANGE && (first === ALL_SOUND_OFF || first === ALL_NOTES_OFF)) {
    return { type: "allNotesOff", source: "midi" };
  }
  return null;
}

export function detectMidiSupport(environment: MidiEnvironment): "unsupported" | "insecure" | "available" {
  // Safari does not implement Web MIDI at all; other browsers expose it only on
  // secure origins (https or localhost).
  if (typeof environment.navigator?.requestMIDIAccess !== "function") {
    return environment.isSecureContext === false ? "insecure" : "unsupported";
  }
  return environment.isSecureContext === false ? "insecure" : "available";
}

/**
 * Progressive enhancement: until connect() is called nothing is requested, and
 * every failure resolves to a state the UI can explain. Nothing here throws, so
 * MIDI can never break the rest of the app.
 */
export function createMidiInput(hub: NoteInputHub, environment: MidiEnvironment): MidiInput {
  const support = detectMidiSupport(environment);
  let state: MidiState = support === "available" ? { status: "idle" } : { status: support };
  let access: MidiAccessLike | null = null;
  const attached = new Set<MidiInputLike>();
  const listeners = new Set<() => void>();

  const setState = (next: MidiState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const devicesOf = (midiAccess: MidiAccessLike): Array<MidiInputLike> => {
    const inputs: MidiInputLike[] = [];
    midiAccess.inputs.forEach((input) => {
      if (input.state !== "disconnected") inputs.push(input);
    });
    return inputs;
  };

  const releaseAll = () => hub.emit({ type: "allNotesOff", source: "midi" });

  const attach = () => {
    if (!access) return;
    const inputs = devicesOf(access);
    const previous = state.status === "connected" ? state : null;
    const selectedId =
      previous && inputs.some((input) => input.id === previous.selectedId) ? previous.selectedId : ALL_INPUTS;
    attached.forEach((input) => {
      input.onmidimessage = null;
    });
    attached.clear();
    inputs
      .filter((input) => selectedId === ALL_INPUTS || input.id === selectedId)
      .forEach((input) => {
        input.onmidimessage = (message) => {
          const event = parseMidiMessage(message.data);
          if (event) hub.emit(event);
        };
        attached.add(input);
      });
    setState({
      status: "connected",
      devices: inputs.map((input) => ({ id: input.id, name: deviceName(input) })),
      selectedId,
      playThrough: previous ? previous.playThrough : false,
    });
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async connect() {
      if (state.status === "unsupported" || state.status === "insecure" || state.status === "requesting")
        return;
      if (state.status === "connected") return;
      const request = environment.navigator?.requestMIDIAccess;
      if (!request) return;
      setState({ status: "requesting" });
      try {
        access = await request.call(environment.navigator, { sysex: false });
      } catch (error) {
        access = null;
        setState({ status: "denied", message: deniedMessage(error) });
        return;
      }
      access.onstatechange = (event) => {
        if (event.port && event.port.type && event.port.type !== "input") return;
        // A keyboard unplugged mid-note would otherwise leave keys lit forever.
        releaseAll();
        attach();
      };
      attach();
    },

    selectInput(id) {
      if (state.status !== "connected") return;
      if (id !== ALL_INPUTS && !state.devices.some((device) => device.id === id)) return;
      releaseAll();
      state = { ...state, selectedId: id };
      attach();
    },

    setPlayThrough(enabled) {
      if (state.status !== "connected" || state.playThrough === enabled) return;
      setState({ ...state, playThrough: enabled });
    },

    disconnect() {
      attached.forEach((input) => {
        input.onmidimessage = null;
      });
      attached.clear();
      if (access) access.onstatechange = null;
      access = null;
      releaseAll();
      setState(support === "available" ? { status: "idle" } : { status: support });
    },
  };
}

function deviceName(input: MidiInputLike): string {
  const name = input.name?.trim();
  const manufacturer = input.manufacturer?.trim();
  if (name && manufacturer && !name.toLowerCase().includes(manufacturer.toLowerCase())) {
    return `${manufacturer} ${name}`;
  }
  return name || manufacturer || "MIDI keyboard";
}

function deniedMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "MIDI access was blocked. Allow MIDI for this site in the browser, then try again.";
  }
  return "Could not connect to MIDI. Check the keyboard is plugged in, then try again.";
}
