import { describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import {
  DEFAULT_PRACTICE_CONTROLS,
  buildPracticeRequest,
  clampFocusBar,
  formatClock,
  playheadFromTransport,
} from "../coach/practice.ts";
import { pianoReadiness } from "../coach/sampler.ts";

const score = buildScore(generateAssignment({ ...DEFAULT_ASSIGNMENT_INPUTS, seed: "coach-practice" }));

describe("buildPracticeRequest", () => {
  it("plays the whole piece with both hands by default", () => {
    const request = buildPracticeRequest(score, DEFAULT_PRACTICE_CONTROLS, { tempoBpm: 90, countIn: true });
    expect(request.parts).toEqual(["lh", "rh"]);
    expect(request.barRange).toEqual([0, score.meta.bars - 1]);
    expect(request.rate).toBe(1);
    expect(request.loop).toBe(true);
    expect(request.countIn).toBe(true);
  });

  it("expresses loop bar 3, left hand only, at half speed as one request", () => {
    const request = buildPracticeRequest(
      score,
      { lens: "lh", slow: true, loop: true, focusBar: 2 },
      { tempoBpm: 90, countIn: false },
    );
    expect(request).toMatchObject({ parts: ["lh"], barRange: [2, 2], rate: 0.5, loop: true, countIn: false });
  });

  it("drops a focus bar that does not exist in the current score", () => {
    expect(clampFocusBar(score, score.meta.bars)).toBeNull();
    expect(clampFocusBar(score, -1)).toBeNull();
    expect(clampFocusBar(score, 1)).toBe(1);
    const request = buildPracticeRequest(
      score,
      { ...DEFAULT_PRACTICE_CONTROLS, focusBar: 99 },
      { tempoBpm: 90, countIn: false },
    );
    expect(request.barRange).toEqual([0, score.meta.bars - 1]);
  });
});

describe("playheadFromTransport", () => {
  const request = buildPracticeRequest(
    score,
    { lens: "both", slow: true, loop: true, focusBar: 2 },
    { tempoBpm: 90, countIn: true },
  );

  it("reports the count-in as beats 1 to 4", () => {
    expect(playheadFromTransport(request, 0)).toEqual({ phase: "countIn", countInBeat: 1 });
    expect(playheadFromTransport(request, 3.9)).toEqual({ phase: "countIn", countInBeat: 4 });
  });

  it("inverts the half-speed schedule back into score beats", () => {
    // Bar 3 starts at source beat 8; at half speed each source beat takes two transport beats.
    expect(playheadFromTransport(request, 4)).toEqual({ phase: "playing", sourceBeat: 8, barIndex: 2 });
    expect(playheadFromTransport(request, 8)).toEqual({ phase: "playing", sourceBeat: 10, barIndex: 2 });
  });

  it("never reports a position outside the isolated range", () => {
    const position = playheadFromTransport(request, 1000);
    expect(position.phase).toBe("playing");
    if (position.phase === "playing") expect(position.barIndex).toBe(2);
  });
});

describe("pianoReadiness", () => {
  it("reports loading progress, readiness and errors from the active library", () => {
    const base = { activeLibraryId: "soft", libraries: {} };
    expect(pianoReadiness(base)).toEqual({ state: "loading", label: "Piano", percent: null });
    expect(
      pianoReadiness({ ...base, libraries: { soft: { label: "Soft", phase: "progress", progress: 0.42 } } }),
    ).toEqual({ state: "loading", label: "Soft", percent: 42 });
    expect(pianoReadiness({ ...base, libraries: { soft: { label: "Soft", phase: "ready" } } })).toEqual({
      state: "ready",
      label: "Soft",
    });
    expect(
      pianoReadiness({ ...base, libraries: { soft: { label: "Soft", phase: "timeout", error: "slow" } } }),
    ).toEqual({ state: "error", label: "Soft", message: "slow" });
  });
});

describe("formatClock", () => {
  it("formats a countdown", () => {
    expect(formatClock(300)).toBe("5:00");
    expect(formatClock(61.2)).toBe("1:02");
    expect(formatClock(-4)).toBe("0:00");
  });
});
