import {
  createHumanizeContext,
  applyHumanizeToBeat,
  getHumanizedVelocity,
  scaleVelocityByDynamics,
} from "../humanize.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

function makeRng(sequence) {
  let index = 0;
  return () => {
    const value = sequence[index % sequence.length];
    index += 1;
    return value;
  };
}

function run() {
  describe("Humanize context", () => {
    it("disables offsets when toggled off", () => {
      const ctx = createHumanizeContext({
        enabled: false,
        amount: 1,
        swing: 0.2,
        styleDefaults: { timing: 0.02, velocity: 0.1, swing: 0.1 },
      });
      const beat = applyHumanizeToBeat(4, ctx, 0, () => 1);
      expect(beat, `Expected beat to remain unchanged, got ${beat}`).toBe(4);
    });

    it("stays within jitter + swing bounds", () => {
      const ctx = createHumanizeContext({
        enabled: true,
        amount: 1,
        swing: 0.15,
        styleDefaults: { timing: 0.02, velocity: 0.1, swing: 0.05 },
      });
      const rng = makeRng([1]);
      const beat = applyHumanizeToBeat(8, ctx, 0, rng);
      const diff = beat - 8;
      const maxExpected = 0.02 + 0.15;
      expect(
        diff,
        `Exceeded jitter+ swing envelope. diff=${diff.toFixed(4)} expected<=${maxExpected}`,
      ).toBeLessThanOrEqual(maxExpected + 1e-6);
    });

    it("only swings offbeats", () => {
      const ctx = createHumanizeContext({
        enabled: true,
        amount: 0.5,
        swing: 0.1,
        styleDefaults: { timing: 0.01, velocity: 0.05, swing: 0.1 },
      });
      const rng = makeRng([0.5]);
      const downbeat = applyHumanizeToBeat(4, ctx, 0, rng);
      const offbeat = applyHumanizeToBeat(4.5, ctx, 0, rng);
      expect(Math.abs(downbeat - 4), `Downbeat should remain near grid, got ${downbeat}`).toBeLessThan(0.02);
      expect(offbeat, `Swing should delay offbeats, got ${offbeat}`).toBeGreaterThan(4.5);
    });
    it("applies explicit swing position hints", () => {
      const ctx = createHumanizeContext({
        enabled: true,
        amount: 1,
        swing: 0.2,
        styleDefaults: { timing: 0, velocity: 0, swing: 0.2 },
      });
      const baseline = applyHumanizeToBeat(2.5, ctx, 0, () => 0.5);
      const swung = applyHumanizeToBeat(2.5, ctx, 0.5, () => 0.5);
      expect(swung, `Expected swing-positioned note to be delayed (${swung} vs ${baseline})`).toBeGreaterThan(
        baseline,
      );
    });
  });

  describe("Velocity variance", () => {
    it("centers around base velocity", () => {
      const ctx = createHumanizeContext({
        enabled: true,
        amount: 1,
        swing: 0,
        styleDefaults: { timing: 0, velocity: 0.1, swing: 0 },
      });
      const rng = makeRng([0, 1]);
      const lower = getHumanizedVelocity(0.8, ctx, rng);
      const upper = getHumanizedVelocity(0.8, ctx, rng);
      expect(lower, `Expected downward variation, got ${lower}`).toBeLessThan(0.8);
      expect(upper, `Expected upward variation, got ${upper}`).toBeGreaterThan(0.8);
    });
  });

  describe("Dynamics scaling", () => {
    it("boosts accents and softens ghosts", () => {
      const accented = scaleVelocityByDynamics(0.7, { accent: 0.2 });
      const ghosted = scaleVelocityByDynamics(0.7, { ghost: 0.5 });
      expect(accented, `Accent should increase velocity, got ${accented}`).toBeGreaterThan(0.7);
      expect(ghosted, `Ghost should decrease velocity, got ${ghosted}`).toBeLessThan(0.7);
    });
  });
}

run();
