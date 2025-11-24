import { getLoopSettings } from "../audio.js";

function expect(condition, message) {
  if (!condition) throw new Error(message || "Expectation failed");
}

function describe(label, fn) {
  console.log(`\n${label}`);
  fn();
}

function it(label, fn) {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (err) {
    console.error(`✘ ${label}`);
    console.error(err.message);
    throw err;
  }
}

function run() {
  describe("Loop helper", () => {
    it("enables looping when total beats present", () => {
      const { shouldLoop, loopStart, loopEnd } = getLoopSettings(16, true);
      expect(shouldLoop === true, "Expected loop to be enabled for 16 beats");
      expect(loopStart === 0, `Loop start should be 0, got ${loopStart}`);
      expect(loopEnd === "4:0:0", `Unexpected loop end ${loopEnd}`);
    });

    it("disables loop when length missing", () => {
      const { shouldLoop, loopEnd } = getLoopSettings(0, true);
      expect(shouldLoop === false, "Loop should disable when total beats are zero");
      expect(loopEnd === 0, `Loop end should reset to 0, got ${loopEnd}`);
    });

    it("respects toggle flag", () => {
      const { shouldLoop } = getLoopSettings(8, false);
      expect(shouldLoop === false, "Loop should disable when toggle off");
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

export { run };
