import type { InputSource, NoteInputEvent } from "./note-input.js";

export type PlayedState = "held" | "sustained";

type SourceState = {
  held: ReadonlySet<number>;
  /** Released while the pedal was down; still sounding until the pedal lifts. */
  sustained: ReadonlySet<number>;
  pedalDown: boolean;
};

export type HeldNotes = Readonly<Partial<Record<InputSource, SourceState>>>;

export const EMPTY_HELD_NOTES: HeldNotes = Object.freeze({});

const EMPTY_SOURCE: SourceState = Object.freeze({
  held: new Set<number>(),
  sustained: new Set<number>(),
  pedalDown: false,
});

/**
 * Pure reducer over the note-input stream. It answers one question for every
 * consumer: which notes is the player sounding right now, and are they held down
 * or only ringing on the pedal?
 */
export function reduceHeldNotes(state: HeldNotes, event: NoteInputEvent): HeldNotes {
  const current = state[event.source] ?? EMPTY_SOURCE;
  const held = new Set(current.held);
  const sustained = new Set(current.sustained);
  let pedalDown = current.pedalDown;

  switch (event.type) {
    case "noteOn":
      held.add(event.midi);
      // Re-striking a note that was ringing on the pedal makes it held again.
      sustained.delete(event.midi);
      break;
    case "noteOff":
      if (!held.delete(event.midi)) return state;
      if (pedalDown) sustained.add(event.midi);
      break;
    case "sustain":
      if (pedalDown === event.down) return state;
      pedalDown = event.down;
      if (!pedalDown) sustained.clear();
      break;
    case "allNotesOff":
      if (!current.held.size && !current.sustained.size && !current.pedalDown) return state;
      held.clear();
      sustained.clear();
      pedalDown = false;
      break;
  }

  return { ...state, [event.source]: { held, sustained, pedalDown } };
}

/** Every note sounding from any source. Held wins over sustained. */
export function playedNotes(state: HeldNotes, sources?: readonly InputSource[]): Map<number, PlayedState> {
  const played = new Map<number, PlayedState>();
  const entries = Object.entries(state) as Array<[InputSource, SourceState]>;
  entries
    .filter(([source]) => !sources || sources.includes(source))
    .forEach(([, sourceState]) => {
      sourceState.sustained.forEach((midi) => {
        if (!played.has(midi)) played.set(midi, "sustained");
      });
      sourceState.held.forEach((midi) => played.set(midi, "held"));
    });
  return played;
}

/** Notes that started and stopped sounding between two states, for driving sound. */
export function soundingChanges(
  previous: ReadonlyMap<number, PlayedState>,
  next: ReadonlyMap<number, PlayedState>,
): { started: number[]; stopped: number[] } {
  return {
    started: [...next.keys()].filter((midi) => !previous.has(midi)),
    stopped: [...previous.keys()].filter((midi) => !next.has(midi)),
  };
}
