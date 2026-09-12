import type { AudioEngine } from "../audio/playback-engine.js";
import type { Score } from "../domain/score.js";
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
};
