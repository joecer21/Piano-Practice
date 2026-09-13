import type { Lens } from "./practice.js";
import type { BreakdownView } from "./views.js";

export type SessionStepId = "whole" | "leftHand" | "rightHand" | "chords" | "notes" | "free";

export type SessionStep = {
  id: SessionStepId;
  view: BreakdownView;
  /** Overrides the view's default hand, for the hands-apart steps. */
  lens?: Lens;
  title: string;
  /** One line of plain English: what to do this minute. */
  instruction: string;
  /** Share of the session. Five minutes spends 60, 45, 45, 60, 45, 45 seconds. */
  weight: number;
  /** Skipped when the assignment has no motif. */
  needsMotif?: boolean;
};

export const SESSION_STEPS: readonly SessionStep[] = Object.freeze([
  {
    id: "whole",
    view: "whole",
    title: "The whole thing",
    instruction: "Listen once through, then play along with both hands.",
    weight: 60,
  },
  {
    id: "leftHand",
    view: "hands",
    lens: "lh",
    title: "Left hand",
    instruction: "Left hand alone. Select any bar that trips you up and loop it.",
    weight: 45,
  },
  {
    id: "rightHand",
    view: "hands",
    lens: "rh",
    title: "Right hand",
    instruction: "Right hand alone, same idea: loop the hard bar until it is easy.",
    weight: 45,
  },
  {
    id: "chords",
    view: "chords",
    title: "Chord by chord",
    instruction: "Copy each chord's shape as it comes round. The marked keys are the voicing.",
    weight: 60,
  },
  {
    id: "notes",
    view: "notes",
    title: "Note by note",
    instruction: "The motif at half speed. Follow the degrees, then play it from memory.",
    weight: 45,
    needsMotif: true,
  },
  {
    id: "free",
    view: "whole",
    title: "Your turn",
    instruction: "Improvise over the loop. Lean on the filled keys: they are this bar's chord.",
    weight: 45,
  },
]);

export type SessionLength = 120 | 300 | 600 | "untimed";
export const DEFAULT_SESSION_LENGTH: SessionLength = 300;
export const SESSION_LENGTHS: ReadonlyArray<{ length: SessionLength; label: string }> = [
  { length: 120, label: "2 minutes" },
  { length: 300, label: "5 minutes" },
  { length: 600, label: "10 minutes" },
  { length: "untimed", label: "Untimed" },
];

export type ActiveSession = {
  status: "running" | "paused";
  length: SessionLength;
  steps: readonly SessionStep[];
  stepIndex: number;
  /** Planned duration of each step, or null when untimed. */
  stepDurationsMs: readonly number[] | null;
  stepElapsedMs: number;
  /** Time spent practising, excluding pauses. */
  elapsedMs: number;
  /** The step's time is up; move on at the next bar line rather than mid-bar. */
  advanceDue: boolean;
  timeByStep: Readonly<Partial<Record<SessionStepId, number>>>;
};

export type SessionState =
  | { status: "idle" }
  | ActiveSession
  | {
      status: "complete";
      length: SessionLength;
      steps: readonly SessionStep[];
      elapsedMs: number;
      timeByStep: Readonly<Partial<Record<SessionStepId, number>>>;
    };

export type SessionAction =
  | { type: "start"; length: SessionLength; hasMotif: boolean }
  | { type: "tick"; elapsedMs: number }
  /** Playback crossed a bar line. Due steps advance here. */
  | { type: "barBoundary" }
  /** Advance now: the player asked, or nothing is playing to wait for a bar line. */
  | { type: "next" }
  | { type: "previous" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "end" };

export const IDLE_SESSION: SessionState = Object.freeze({ status: "idle" });

export function sessionSteps(hasMotif: boolean): readonly SessionStep[] {
  return SESSION_STEPS.filter((step) => hasMotif || !step.needsMotif);
}

export function planStepDurations(steps: readonly SessionStep[], length: SessionLength): number[] | null {
  if (length === "untimed") return null;
  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
  const totalMs = length * 1000;
  // Distribute whole milliseconds so the plan always sums to the session length.
  let assigned = 0;
  return steps.map((step, index) => {
    const duration =
      index === steps.length - 1 ? totalMs - assigned : Math.round((totalMs * step.weight) / totalWeight);
    assigned += duration;
    return duration;
  });
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "start": {
      const steps = sessionSteps(action.hasMotif);
      return {
        status: "running",
        length: action.length,
        steps,
        stepIndex: 0,
        stepDurationsMs: planStepDurations(steps, action.length),
        stepElapsedMs: 0,
        elapsedMs: 0,
        advanceDue: false,
        timeByStep: {},
      };
    }
    case "end":
      return IDLE_SESSION;
  }

  if (state.status !== "running" && state.status !== "paused") return state;

  switch (action.type) {
    case "tick": {
      if (state.status !== "running" || !(action.elapsedMs > 0)) return state;
      const step = state.steps[state.stepIndex];
      const stepElapsedMs = state.stepElapsedMs + action.elapsedMs;
      const planned = state.stepDurationsMs?.[state.stepIndex];
      return {
        ...state,
        stepElapsedMs,
        elapsedMs: state.elapsedMs + action.elapsedMs,
        advanceDue: state.advanceDue || (planned != null && stepElapsedMs >= planned),
        timeByStep: { ...state.timeByStep, [step.id]: (state.timeByStep[step.id] ?? 0) + action.elapsedMs },
      };
    }
    case "barBoundary":
      return state.status === "running" && state.advanceDue ? advance(state, 1) : state;
    case "next":
      return advance(state, 1);
    case "previous":
      return state.stepIndex === 0 ? { ...state, stepElapsedMs: 0, advanceDue: false } : advance(state, -1);
    case "pause":
      return state.status === "running" ? { ...state, status: "paused" } : state;
    case "resume":
      return state.status === "paused" ? { ...state, status: "running" } : state;
  }
  return state;
}

function advance(state: ActiveSession, direction: 1 | -1): SessionState {
  const stepIndex = state.stepIndex + direction;
  if (stepIndex >= state.steps.length) {
    return {
      status: "complete",
      length: state.length,
      steps: state.steps,
      elapsedMs: state.elapsedMs,
      timeByStep: state.timeByStep,
    };
  }
  return { ...state, stepIndex: Math.max(0, stepIndex), stepElapsedMs: 0, advanceDue: false };
}

/** Time left in a timed session, clamped: the last step may overrun to its bar line. */
export function remainingMs(state: ActiveSession): number | null {
  if (!state.stepDurationsMs) return null;
  const total = state.stepDurationsMs.reduce((sum, duration) => sum + duration, 0);
  return Math.max(0, total - state.elapsedMs);
}

/** Fraction of the current step done, for its progress marker. 0 when untimed. */
export function stepProgress(state: ActiveSession): number {
  const planned = state.stepDurationsMs?.[state.stepIndex];
  if (!planned) return 0;
  return Math.min(1, state.stepElapsedMs / planned);
}

export function startLabel(length: SessionLength): string {
  return length === "untimed" ? "Start practising" : `Start ${length / 60} minutes`;
}

/**
 * True when playback moved past a bar line, including wrapping back to the start
 * of a loop - a one-bar loop never changes bar index, but it does cross a line.
 */
export function crossedBarBoundary(previousBeat: number, nextBeat: number, beatsPerBar: number): boolean {
  if (!Number.isFinite(previousBeat) || !Number.isFinite(nextBeat)) return false;
  if (nextBeat < previousBeat) return true;
  return Math.floor(nextBeat / beatsPerBar) !== Math.floor(previousBeat / beatsPerBar);
}

/** Active time is monotonic and only accrues while this page is visible. */
export function visibleTimerDelta(previous: number, next: number, visible: boolean): number {
  if (!visible || !Number.isFinite(previous) || !Number.isFinite(next) || next <= previous) return 0;
  return next - previous;
}
