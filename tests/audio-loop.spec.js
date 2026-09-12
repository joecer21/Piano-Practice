import { getLoopSettings } from "../audio.js";
import { describe, it } from "vitest";
import { expect } from "vitest";

function run() {
  describe("Loop helper", () => {
    it("enables looping when total beats present", () => {
      const { shouldLoop, loopStart, loopEnd } = getLoopSettings(16, true);
      expect(shouldLoop, "Expected loop to be enabled for 16 beats").toBe(true);
      expect(loopStart, `Loop start should be 0, got ${loopStart}`).toBe(0);
      expect(loopEnd, `Unexpected loop end ${loopEnd}`).toBe("4:0:0");
    });

    it("disables loop when length missing", () => {
      const { shouldLoop, loopEnd } = getLoopSettings(0, true);
      expect(shouldLoop, "Loop should disable when total beats are zero").toBe(false);
      expect(loopEnd, `Loop end should reset to 0, got ${loopEnd}`).toBe(0);
    });

    it("respects toggle flag", () => {
      const { shouldLoop } = getLoopSettings(8, false);
      expect(shouldLoop, "Loop should disable when toggle off").toBe(false);
    });
  });
}

run();
