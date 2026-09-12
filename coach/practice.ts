import type { PlayRequest } from "../audio/playback-engine.js";
import type { PartId, Score } from "../domain/score.js";

/** Which hands the two displays and playback are filtered to. */
export type Lens = "both" | "lh" | "rh";

export type PracticeControls = {
  lens: Lens;
  /** Half speed. Changes duration only, never pitch or voicing. */
  slow: boolean;
  loop: boolean;
  /** Zero-based bar the player has isolated, or null for the whole piece. */
  focusBar: number | null;
};

export const DEFAULT_PRACTICE_CONTROLS: Readonly<PracticeControls> = Object.freeze({
  lens: "both",
  slow: false,
  loop: true,
  focusBar: null,
});

export const HALF_SPEED_RATE = 0.5;

export function partsForLens(lens: Lens): PartId[] {
  return lens === "both" ? ["lh", "rh"] : [lens];
}

/**
 * Slow, loop and isolate all reduce to one PlayRequest: selecting a bar narrows
 * the range, isolating a hand narrows the parts, and half speed changes the rate.
 */
export function buildPracticeRequest(
  score: Score,
  controls: PracticeControls,
  options: { tempoBpm: number; countIn: boolean },
): PlayRequest {
  const focusBar = clampFocusBar(score, controls.focusBar);
  return {
    score,
    parts: partsForLens(controls.lens),
    barRange: focusBar == null ? [0, score.meta.bars - 1] : [focusBar, focusBar],
    rate: controls.slow ? HALF_SPEED_RATE : 1,
    loop: controls.loop,
    countIn: options.countIn,
    tempoBpm: options.tempoBpm,
  };
}

/** A focus bar that no longer exists after the assignment changes is dropped. */
export function clampFocusBar(score: Score, focusBar: number | null): number | null {
  if (focusBar == null) return null;
  return Number.isInteger(focusBar) && focusBar >= 0 && focusBar < score.meta.bars ? focusBar : null;
}

export type PlayheadPosition =
  { phase: "countIn"; countInBeat: number } | { phase: "playing"; sourceBeat: number; barIndex: number };

/**
 * Map the transport position back to a position in the score. The engine
 * schedules source beat `b` at `countIn + (b - rangeStart) / rate` and loops the
 * transport between the count-in and the end of the range, so this inverts that.
 */
export function playheadFromTransport(request: PlayRequest, transportBeat: number): PlayheadPosition {
  const beatsPerBar = request.score.meta.beatsPerBar;
  const countInBeats = request.countIn ? beatsPerBar : 0;
  if (transportBeat < countInBeats) {
    return { phase: "countIn", countInBeat: Math.min(beatsPerBar, Math.floor(transportBeat) + 1) };
  }
  const rangeStart = request.barRange[0] * beatsPerBar;
  const rangeEnd = (request.barRange[1] + 1) * beatsPerBar;
  const raw = rangeStart + (transportBeat - countInBeats) * request.rate;
  const sourceBeat = Math.min(Math.max(raw, rangeStart), rangeEnd - 1e-6);
  return { phase: "playing", sourceBeat, barIndex: Math.floor(sourceBeat / beatsPerBar) };
}

export const SESSION_SECONDS = 5 * 60;

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}
