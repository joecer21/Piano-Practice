import {
  createHumanizeContext,
  applyHumanizeToBeat,
  getHumanizedVelocity,
  scaleVelocityByDynamics,
} from "../humanize.js";
import { describe, it } from "vitest";
import { expectContract as expect } from "./test-helpers.js";

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
      expect(beat === 4, `Expected beat to remain unchanged, got ${beat}`);
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
        diff <= maxExpected + 1e-6,
        `Exceeded jitter+ swing envelope. diff=${diff.toFixed(4)} expected<=${maxExpected}`
      );
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
      expect(Math.abs(downbeat - 4) < 0.02, `Downbeat should remain near grid, got ${downbeat}`);
      expect(offbeat > 4.5, `Swing should delay offbeats, got ${offbeat}`);
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
      expect(swung > baseline, `Expected swing-positioned note to be delayed (${swung} vs ${baseline})`);
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
      expect(lower < 0.8, `Expected downward variation, got ${lower}`);
      expect(upper > 0.8, `Expected upward variation, got ${upper}`);
    });
  });

  describe("Dynamics scaling", () => {
    it("boosts accents and softens ghosts", () => {
      const accented = scaleVelocityByDynamics(0.7, { accent: 0.2 });
      const ghosted = scaleVelocityByDynamics(0.7, { ghost: 0.5 });
      expect(accented > 0.7, `Accent should increase velocity, got ${accented}`);
      expect(ghosted < 0.7, `Ghost should decrease velocity, got ${ghosted}`);
    });
  });
}

run();
