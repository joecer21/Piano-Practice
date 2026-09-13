import type { Preferences, StarredAssignment } from "../application/library.js";
import type { AudioEngine } from "../audio/playback-engine.js";
import type { Score } from "../domain/score.js";
import type { MidiInput } from "../input/midi.js";
import type { NoteInputHub } from "../input/note-input.js";
import type { SamplerSnapshot } from "./sampler.js";

/** The slice of the committed assignment the coach renders. */
export type CoachAssignment = {
  score: Score;
  leftHand: { name?: string } | null;
  motif: { description?: string } | null;
};

/**
 * Everything the coach needs from the legacy application, passed in rather than
 * imported. The coach never reaches into main.js state or the DOM it owns; the
 * audio engine is used only through its public PlayRequest contract.
 */
export type CoachBridge = {
  audioEngine: AudioEngine;
  /** Must return the same object until the committed assignment changes. */
  getAssignment(): CoachAssignment | null;
  subscribeAssignment(listener: () => void): () => void;
  /** Must return the same object until sampler status changes. */
  getSamplerSnapshot(): SamplerSnapshot;
  subscribeSampler(listener: () => void): () => void;
  getTempoBpm(): number;
  /** Resolves false when the browser keeps audio blocked; the bridge reports why. */
  unlockAudio(): Promise<boolean>;
  /** Stop any playback started by the legacy controls before the coach plays. */
  stopOtherPlayback(): void;
  reportError(message: string): void;
  openAssignmentDrawer(): void;
  getKeyboardElement(): HTMLElement | null;
  /** Everything the player plays, from any input. The coach mirrors it. */
  noteInput: NoteInputHub;
  midiInput: MidiInput;
  /** Called from a click, so enabling can unlock audio. */
  setMidiPlayThrough(enabled: boolean): Promise<void>;
  /** Same progression, groove, motif and mode in a new key. False if it could not be built. */
  rerollIntoNewKey(): boolean;
  /** Starred assignments, share links and practice preferences, kept in this browser. */
  library: CoachLibrary;
};

export type CoachLibrarySnapshot = {
  starred: readonly StarredAssignment[];
  /** Whether the assignment on screen is starred. */
  currentStarred: boolean;
};

export type CoachLibrary = {
  /** Must return the same object until the starred list or the current assignment changes. */
  getSnapshot(): CoachLibrarySnapshot;
  subscribe(listener: () => void): () => void;
  /** The address that reopens the assignment on screen, or null before there is one. */
  currentShareUrl(): string | null;
  /** A short name for the assignment on screen, for sharing. */
  currentTitle(): string | null;
  toggleStarCurrent(): void;
  /** Opens through learner-facing generation. False if it could not be opened. */
  open(fragment: string): boolean;
  unstar(fragment: string): void;
  preferences(): Preferences;
  setPreference<K extends keyof Preferences>(name: K, value: Preferences[K]): void;
};
