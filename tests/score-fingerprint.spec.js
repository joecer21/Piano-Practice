// Score fingerprint: the frozen record of how Score interprets every fingerprinted
// case - roles, degrees, provenance, bar chords, timing and pitch.
//
// Re-freeze an intended change with `npm run fingerprint:write-score`, after
// confirming only the cases and fields you expect have moved.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changedFieldPaths, fingerprintCaseIds } from "./support/fingerprint.js";
import { scoreFactsForCase, scoreFingerprint } from "./support/score-fingerprint.js";

const BASELINE = new URL("./fixtures/score-fingerprint.json", import.meta.url);
const CURATED = new URL("./fixtures/curated-score/", import.meta.url);

// Readable Score fixtures, chosen to cover the degree spellings that differ by mode.
export const CURATED_SCORE_CASES = [
  "coverage:major:C",
  "coverage:minor:C",
  "coverage:pentatonicMinor:A#",
  "coverage:minorBlues:C",
  "coverage:majorBlues:F#",
  "property-24",
];

const WRITE = process.env.FINGERPRINT_WRITE === "score";
const caseIds = fingerprintCaseIds();
const curatedFile = (caseId) =>
  new URL(`${caseId.replace(/[:#]/g, (c) => (c === ":" ? "_" : "s"))}.json`, CURATED);

describe("Score fingerprint", () => {
  it.runIf(WRITE)("re-freezes the Score fingerprint", () => {
    const matrix = Object.fromEntries(caseIds.map((id) => [id, scoreFingerprint(scoreFactsForCase(id))]));
    writeFileSync(BASELINE, JSON.stringify(matrix, null, 2) + "\n");
    mkdirSync(CURATED, { recursive: true });
    for (const id of CURATED_SCORE_CASES) {
      writeFileSync(curatedFile(id), JSON.stringify(scoreFactsForCase(id), null, 2) + "\n");
    }
  });

  it.skipIf(WRITE)("matches the frozen interpretation for every case", () => {
    expect(existsSync(BASELINE), "no Score fingerprint; run npm run fingerprint:write-score").toBe(true);
    const frozen = JSON.parse(readFileSync(BASELINE, "utf8"));

    expect(Object.keys(frozen).sort(), "the set of fingerprinted cases changed").toEqual([...caseIds].sort());

    const moved = caseIds.filter((id) => frozen[id] !== scoreFingerprint(scoreFactsForCase(id)));
    const readable = moved
      .filter((id) => CURATED_SCORE_CASES.includes(id))
      .map((id) => {
        const before = JSON.parse(readFileSync(curatedFile(id), "utf8"));
        const paths = [...new Set(changedFieldPaths(before, scoreFactsForCase(id)))];
        return `${id}: ${paths.join(", ")}`;
      });
    expect(
      moved,
      `${moved.length} case(s) moved.${readable.length ? `\nChanged fields in curated cases:\n  ${readable.join("\n  ")}` : ""}`,
    ).toEqual([]);
  });

  it.skipIf(WRITE)("keeps the curated Score fixtures in step with the baseline", () => {
    for (const id of CURATED_SCORE_CASES) {
      expect(existsSync(curatedFile(id)), `missing curated fixture for ${id}`).toBe(true);
      const curated = JSON.parse(readFileSync(curatedFile(id), "utf8"));
      expect(changedFieldPaths(curated, scoreFactsForCase(id)), id).toEqual([]);
    }
  });
});
