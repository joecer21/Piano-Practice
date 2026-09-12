import { describe, expect, it } from "vitest";
import {
  DURATION_TABLE,
  MOTIF_STYLES,
  beatsToTone,
  durationToNotation,
  toneToBeatsFromDuration,
} from "../theory.js";
import { assignmentForSeed, propertySeeds } from "./support/fingerprint.js";

describe("duration table", () => {
  it("round-trips every tabled duration beats -> tone -> beats", () => {
    for (const { beats, tone, label } of DURATION_TABLE) {
      expect(beatsToTone(beats), `${beats} beats should render as ${tone}`).toBe(tone);
      expect(toneToBeatsFromDuration(tone), `${tone} should read back as ${beats} beats`).toBe(beats);
      expect(durationToNotation(beats)).toBe(label);
    }
  });

  it("covers every rhythm value declared by any motif style", () => {
    const tabled = new Set(DURATION_TABLE.map((entry) => entry.beats));
    for (const [styleId, style] of Object.entries(MOTIF_STYLES)) {
      for (const step of style.rhythm || []) {
        expect(tabled.has(step.beats), `${styleId} uses an untabled duration: ${step.beats} beats`).toBe(true);
      }
    }
  });

  it("never renders a longer note as a shorter one", () => {
    // The B3 defect: 3- and 4-beat notes fell through to "4n" and were truncated
    // to a single beat. Sounded length must be monotonic in notated length.
    const sorted = [...DURATION_TABLE].sort((a, b) => a.beats - b.beats);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = toneToBeatsFromDuration(beatsToTone(sorted[i - 1].beats));
      const current = toneToBeatsFromDuration(beatsToTone(sorted[i].beats));
      expect(current, `${sorted[i].beats} beats must not sound shorter than ${sorted[i - 1].beats}`).toBeGreaterThan(previous);
    }
  });

  it("emits no step whose sounded duration disagrees with its notated beats", () => {
    for (const seed of propertySeeds()) {
      const assignment = assignmentForSeed(seed);
      const steps = [
        ...assignment.leftHand.bars.flatMap((bar) => bar.steps),
        ...(assignment.motif?.steps || []),
      ];
      for (const step of steps) {
        expect(
          toneToBeatsFromDuration(step.duration),
          `${seed}: a ${step.beats}-beat step is scheduled as ${step.duration}`,
        ).toBe(step.beats);
      }
    }
  });
});
