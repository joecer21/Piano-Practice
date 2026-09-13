import type { Preferences, StarredAssignment } from "../application/library.js";
import type {
  LearningLens,
  PracticeRecommendation,
  PracticeRecord,
  PracticeStatus,
} from "../application/practice-record.js";
import type { StatusService } from "../application/status.js";
import type { AudioEngine, PlayRequest } from "../audio/playback-engine.js";
import type { AssignmentInputs, AssignmentLocks } from "../domain/assignment.js";
import type { Score } from "../domain/score.js";
import type { MidiInput } from "../input/midi.js";
import type { NoteInputHub } from "../input/note-input.js";
import type { SamplerSnapshot } from "./sampler.js";

/** The slice of the committed assignment the coach renders. */
export type CoachAssignment = {
  score: Score;
  scale: { name?: string; notes?: readonly string[] } | null;
  leftHand: { name?: string } | null;
  motif: { description?: string } | null;
};

/**
 * Everything the coach needs from the host application, passed in rather than
 * imported. The coach never reaches into main.js state or the DOM it owns; the
 * audio engine is used only through its public PlayRequest contract.
 */
export type CoachBridge = {
  /** Release host subscriptions when the application root is unmounted. */
  dispose(): void;
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
  /** Stop any playback started by the page controls before the coach plays. */
  stopOtherPlayback(): void;
  /** Application-level diagnostic observer; production behavior must not depend on it. */
  observePlayback(request: PlayRequest): void;
  status: StatusService;
  reportError(message: string): void;
  getKeyboardElement(): HTMLElement | null;
  /** Everything the player plays, from any input. The coach mirrors it. */
  noteInput: NoteInputHub;
  midiInput: MidiInput;
  /** Called from a click, so enabling can unlock audio. */
  setMidiPlayThrough(enabled: boolean): Promise<void>;
  /** Same progression, groove, motif and mode in a new key. False if it could not be built. */
  rerollIntoNewKey(): boolean;
  /** Edit and regenerate the assignment without exposing the legacy DOM or mutable store. */
  assignmentEditor: AssignmentEditor;
  /** Reactive sound controls, expressed in the units shown to the player. */
  soundSettings: SoundSettings;
  /** The one audition not represented by Score playback: the scale itself. */
  scaleAudition: ScaleAudition;
  /** Starred assignments, share links and practice preferences, kept in this browser. */
  library: CoachLibrary;
  /** Durable guided-session records and deterministic next-practice suggestions. */
  practiceHistory: PracticeHistory;
  /** Offline availability and whether a newer version is waiting for a reload. */
  offline: OfflineUpdates;
};

export type OfflineUpdatesSnapshot = {
  offlineReady: boolean;
  /** "available": a newer version is installed and applies on reload. */
  update: "none" | "available" | "applying";
  cacheVersion: string | null;
};

export type OfflineUpdates = {
  /** Must return the same object until offline state changes. */
  getSnapshot(): OfflineUpdatesSnapshot;
  subscribe(listener: () => void): () => void;
  applyUpdate(): void;
};

export type ScaleAuditionSnapshot = {
  playing: boolean;
  activeNote: string | null;
};

export type ScaleAudition = {
  getSnapshot(): ScaleAuditionSnapshot;
  subscribe(listener: () => void): () => void;
  play(loop: boolean): Promise<void>;
  stop(): void;
};

export type MixPart = "left" | "lead";

export type SoundSettingsSnapshot = {
  tempoBpm: number;
  mix: Record<MixPart, { volumeDb: number; muted: boolean }>;
  humanize: { enabled: boolean; amountPercent: number; swingPercent: number };
  effects: { reverbPercent: number; largeRoom: boolean; motifWidthPercent: number };
};

export type SoundSettings = {
  /** Must return the same object until one of these settings changes. */
  getSnapshot(): SoundSettingsSnapshot;
  subscribe(listener: () => void): () => void;
  setTempo(tempoBpm: number): void;
  selectLibrary(libraryId: string): Promise<void>;
  playAll(loop: boolean): Promise<void>;
  stopAll(): void;
  setMixVolume(part: MixPart, volumeDb: number): void;
  setMixMuted(part: MixPart, muted: boolean): void;
  setHumanizeEnabled(enabled: boolean): void;
  setHumanizeAmount(amountPercent: number): void;
  setSwingAmount(swingPercent: number): void;
  setReverb(reverbPercent: number): void;
  setLargeRoom(enabled: boolean): void;
  setMotifWidth(widthPercent: number): void;
};

export type AssignmentEditorSnapshot = {
  /** Keeps the same identity until the assignment, locks, or history changes. */
  inputs: AssignmentInputs;
  locks: AssignmentLocks;
  assignmentId: string | null;
  seed: string;
  canUndo: boolean;
  canRedo: boolean;
};

export type AssignmentEditorResult = {
  ok: boolean;
  message: string;
};

export type AssignmentEditor = {
  getSnapshot(): AssignmentEditorSnapshot;
  subscribe(listener: () => void): () => void;
  apply(inputs: AssignmentInputs): AssignmentEditorResult;
  applyPreset(presetId: string): AssignmentEditorResult;
  reroll(): AssignmentEditorResult;
  undo(): AssignmentEditorResult;
  redo(): AssignmentEditorResult;
  toggleLock(component: keyof AssignmentLocks): void;
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

export type PracticeHistorySnapshot = {
  records: readonly PracticeRecord[];
  recommendation: PracticeRecommendation | null;
  revisitAfterDays: number;
};

export type PracticeActivity = {
  activeDurationMs: number;
  endingTempo: number;
  handsPractised: Array<"left" | "right">;
  barsVisited: number[];
  learningLenses: LearningLens[];
};

export type PracticeHistory = {
  getSnapshot(): PracticeHistorySnapshot;
  subscribe(listener: () => void): () => void;
  beginCurrent(resumeId?: string): PracticeRecord | null;
  update(id: string, activity: PracticeActivity): void;
  finish(id: string, status: Exclude<PracticeStatus, "incomplete">, activity: PracticeActivity): void;
  annotate(
    id: string,
    fields: { label?: string | null; notes?: string | null; needsWorkBars?: number[] },
  ): void;
  open(id: string, options?: { newKey?: boolean }): boolean;
  delete(id: string): void;
  clear(): void;
  exportJson(): string;
  importJson(source: string): { ok: boolean; imported: number; duplicates: number };
  setRevisitAfterDays(days: number): void;
};
