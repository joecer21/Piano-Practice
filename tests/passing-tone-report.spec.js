// Writes the outside-collection note report for musical review.
//   npm run report:passing-tones   # -> test-results/passing-tones.md
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { renderOutsideCollectionReport } from "./support/passing-tones.js";

const OUT = process.env.PASSING_TONE_REPORT;

describe("Outside-collection note report", () => {
  it.runIf(OUT)("writes the report", () => {
    mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
    writeFileSync(OUT, renderOutsideCollectionReport());
  });
});
