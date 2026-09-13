// Writes the chord-aware outside-collection review of the motif catalog.
//   npm run report:outside-collection   # -> test-results/outside-collection-notes.md
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { renderOutsideCollectionReport } from "./support/outside-collection.js";

const OUT = process.env.OUTSIDE_COLLECTION_REPORT;

describe("Outside-collection note report", () => {
  it.runIf(OUT)("writes the report", () => {
    mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
    writeFileSync(OUT, renderOutsideCollectionReport());
  });
});
