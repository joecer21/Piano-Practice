import { describe, expect, it } from "vitest";
import {
  IDLE_SESSION,
  SESSION_STEPS,
  crossedBarBoundary,
  planStepDurations,
  remainingMs,
  sessionReducer,
  sessionSteps,
  startLabel,
  stepProgress,
} from "../coach/session.ts";

const run = (state, ...actions) => actions.reduce(sessionReducer, state);
const start = (length = 300, hasMotif = true) =>
  sessionReducer(IDLE_SESSION, { type: "start", length, hasMotif });
const tick = (ms) => ({ type: "tick", elapsedMs: ms });

describe("session plan", () => {
  it("walks the whole thing, each hand, chords, notes, then free improv", () => {
    expect(SESSION_STEPS.map((step) => step.id)).toEqual([
      "whole",
      "leftHand",
      "rightHand",
      "chords",
      "notes",
      "free",
    ]);
    expect(SESSION_STEPS.every((step) => step.instruction.length > 10)).toBe(true);
  });

  it("splits five minutes into 60/45/45/60/45/45 seconds that sum exactly", () => {
    const durations = planStepDurations(SESSION_STEPS, 300);
    expect(durations).toEqual([60_000, 45_000, 45_000, 60_000, 45_000, 45_000]);
  });

  it("scales to other lengths without losing a millisecond, and has no plan when untimed", () => {
    for (const length of [120, 600]) {
      expect(planStepDurations(SESSION_STEPS, length).reduce((a, b) => a + b, 0)).toBe(length * 1000);
    }
    expect(planStepDurations(SESSION_STEPS, "untimed")).toBeNull();
  });

  it("skips note by note when the assignment has no motif", () => {
    expect(sessionSteps(false).map((step) => step.id)).not.toContain("notes");
    expect(planStepDurations(sessionSteps(false), 300).reduce((a, b) => a + b, 0)).toBe(300_000);
  });

  it("labels the start button by length", () => {
    expect(startLabel(300)).toBe("Start 5 minutes");
    expect(startLabel(120)).toBe("Start 2 minutes");
    expect(startLabel("untimed")).toBe("Start practising");
  });
});

describe("session reducer", () => {
  it("does not change step mid-bar: time up only marks the step due", () => {
    const due = run(start(), tick(60_000));
    expect(due.stepIndex).toBe(0);
    expect(due.advanceDue).toBe(true);

    const moved = sessionReducer(due, { type: "barBoundary" });
    expect(moved.stepIndex).toBe(1);
    expect(moved.advanceDue).toBe(false);
    expect(moved.stepElapsedMs).toBe(0);
  });

  it("ignores bar lines before the step is due", () => {
    const early = run(start(), tick(30_000), { type: "barBoundary" });
    expect(early.stepIndex).toBe(0);
  });

  it("stops counting while paused and resumes where it left off", () => {
    const paused = run(start(), tick(10_000), { type: "pause" }, tick(50_000));
    expect(paused.status).toBe("paused");
    expect(paused.elapsedMs).toBe(10_000);
    const resumed = run(paused, { type: "resume" }, tick(5_000));
    expect(resumed.elapsedMs).toBe(15_000);
    expect(remainingMs(resumed)).toBe(285_000);
  });

  it("records time per step for the summary and completes after the last step's bar line", () => {
    let state = start();
    for (const duration of planStepDurations(SESSION_STEPS, 300)) {
      state = run(state, tick(duration), { type: "barBoundary" });
    }
    expect(state.status).toBe("complete");
    expect(state.elapsedMs).toBe(300_000);
    expect(state.timeByStep).toEqual({
      whole: 60_000,
      leftHand: 45_000,
      rightHand: 45_000,
      chords: 60_000,
      notes: 45_000,
      free: 45_000,
    });
  });

  it("lets the player skip ahead or go back, restarting that step's time", () => {
    const skipped = run(start(), tick(20_000), { type: "next" }, { type: "next" });
    expect(skipped.stepIndex).toBe(2);
    const back = run(skipped, tick(5_000), { type: "previous" });
    expect(back.stepIndex).toBe(1);
    expect(back.stepElapsedMs).toBe(0);
    expect(run(start(), { type: "previous" }).stepIndex).toBe(0);
  });

  it("never advances an untimed session on its own", () => {
    const state = run(start("untimed"), tick(10 * 60_000), { type: "barBoundary" });
    expect(state.stepIndex).toBe(0);
    expect(state.advanceDue).toBe(false);
    expect(remainingMs(state)).toBeNull();
    expect(stepProgress(state)).toBe(0);
  });

  it("reports progress within a step and clamps the remaining time at zero", () => {
    const halfway = run(start(), tick(30_000));
    expect(stepProgress(halfway)).toBe(0.5);
    expect(remainingMs(run(start(), tick(400_000)))).toBe(0);
  });

  it("returns to idle on end", () => {
    expect(run(start(), tick(1_000), { type: "end" })).toEqual({ status: "idle" });
  });
});

describe("crossedBarBoundary", () => {
  it("detects a new bar and the wrap of a one-bar loop, but not movement within a bar", () => {
    expect(crossedBarBoundary(3.9, 4.1, 4)).toBe(true);
    expect(crossedBarBoundary(1, 3, 4)).toBe(false);
    expect(crossedBarBoundary(11.9, 8.05, 4)).toBe(true);
    expect(crossedBarBoundary(Number.NaN, 4, 4)).toBe(false);
  });
});
