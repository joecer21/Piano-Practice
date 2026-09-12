/**
 * One stream of notes played by the person at the keyboard, whatever they played
 * them on. Mirroring and sound both read this stream, so nothing downstream needs
 * to know whether a note came from a mouse, a computer key or a MIDI keyboard.
 *
 * Playback of the assignment is deliberately not part of this stream: it is the
 * music being taught, not the music being played back to the learner.
 */
export type InputSource = "pointer" | "screenKey" | "computerKeyboard" | "midi";

export type NoteInputEvent =
  | { type: "noteOn"; midi: number; velocity: number; source: InputSource }
  | { type: "noteOff"; midi: number; source: InputSource }
  /** Sustain pedal. Applies to notes from the same source only. */
  | { type: "sustain"; down: boolean; source: InputSource }
  /** Release everything from a source: device unplugged, MIDI panic, window blur. */
  | { type: "allNotesOff"; source: InputSource };

export type NoteInputListener = (event: NoteInputEvent) => void;

export type NoteInputHub = {
  emit(event: NoteInputEvent): void;
  subscribe(listener: NoteInputListener): () => void;
};

const SOURCES: ReadonlySet<string> = new Set(["pointer", "screenKey", "computerKeyboard", "midi"]);

export function isMidiNote(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 127;
}

export function createNoteInputHub(): NoteInputHub {
  const listeners = new Set<NoteInputListener>();
  return {
    emit(event) {
      assertNoteInputEvent(event);
      // Snapshot so a listener that unsubscribes during dispatch cannot skip another.
      [...listeners].forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error("Note input listener failed", error);
        }
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function assertNoteInputEvent(event: NoteInputEvent): void {
  if (!event || !SOURCES.has(event.source)) throw new TypeError("note input requires a known source");
  if (event.type === "noteOn" || event.type === "noteOff") {
    if (!isMidiNote(event.midi)) throw new RangeError(`note input midi must be 0-127, got ${event.midi}`);
  }
  if (
    event.type === "noteOn" &&
    !(Number.isFinite(event.velocity) && event.velocity >= 0 && event.velocity <= 1)
  ) {
    throw new RangeError("note input velocity must be from 0 to 1");
  }
}
