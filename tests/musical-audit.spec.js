import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRESET_CONFIGS } from "../presets.js";
import { validateScore } from "../domain/score.ts";
import { musicalAuditCaseDefinitions } from "../audits/musical/cases.js";
import {
  buildMusicalAuditCorpus,
  musicalReviewGateIssues,
  renderMusicalAuditReport,
} from "./support/musical-audit.js";
import { stableStringify } from "./support/fingerprint.js";

const DIRECTORY = new URL("../audits/musical/", import.meta.url);
const CORPUS = new URL("corpus.json", DIRECTORY);
const REVIEWS = new URL("reviews.json", DIRECTORY);
const REPORT = new URL("report.md", DIRECTORY);
const WRITE = process.env.MUSICAL_AUDIT_WRITE === "1";

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

describe("musical audition corpus", () => {
  it.runIf(WRITE)("writes the canonical corpus without manufacturing human approval", () => {
    mkdirSync(DIRECTORY, { recursive: true });
    const corpus = buildMusicalAuditCorpus();
    writeFileSync(CORPUS, `${JSON.stringify(corpus, null, 2)}\n`);
    if (existsSync(REVIEWS)) {
      writeFileSync(REPORT, renderMusicalAuditReport(corpus, readJson(REVIEWS)));
    }
    expect(corpus.cases.length).toBeGreaterThan(PRESET_CONFIGS.length);
  });

  it.skipIf(WRITE)("matches the generated assignments and canonical Scores exactly", () => {
    expect(existsSync(CORPUS), "missing corpus; run npm run audit:music:write").toBe(true);
    const stored = readJson(CORPUS);
    const current = buildMusicalAuditCorpus();
    expect(stored.corpusFingerprint).toBe(current.corpusFingerprint);
    expect(stableStringify(stored)).toBe(stableStringify(current));
    stored.cases.forEach((entry) =>
      expect(validateScore(entry.score), entry.id).toEqual({ valid: true, errors: [] }),
    );
  });

  it("covers every requested listening dimension with stable, explained inputs", () => {
    const definitions = musicalAuditCaseDefinitions();
    const ids = definitions.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    PRESET_CONFIGS.forEach((preset) => expect(ids).toContain(`preset:${preset.id}`));

    const categories = new Set(definitions.flatMap((entry) => entry.categories));
    ["pentatonicMajor", "pentatonicMinor", "majorBlues", "minorBlues"].forEach((mode) =>
      expect(categories).toContain(`collection:${mode}`),
    );
    [
      "parent-degree",
      "scale-step",
      "borrowed-note",
      "passing-tone",
      "accented-outside-note",
      "custom-progression",
      "range-boundary",
      "hand-spacing",
      "historical-regression",
    ].forEach((category) => expect(categories).toContain(category));

    definitions.forEach((entry) => {
      expect(entry.inputs.seed, `${entry.id} seed`).toBeTruthy();
      expect(entry.rationale.length, `${entry.id} rationale`).toBeGreaterThan(30);
      expect(entry.listenFor.length, `${entry.id} listening prompts`).toBeGreaterThan(0);
    });
  });

  it.skipIf(WRITE)("requires a current, non-rejected listening disposition", () => {
    const corpus = readJson(CORPUS);
    const ledger = readJson(REVIEWS);
    expect(musicalReviewGateIssues(corpus, ledger)).toEqual([]);

    const changed = structuredClone(corpus);
    changed.cases[0].score.parts.lh[0].midi += 1;
    changed.cases[0].caseFingerprint = "changed";
    changed.corpusFingerprint = "changed";
    const changedIssues = musicalReviewGateIssues(changed, ledger);
    expect(changedIssues).toContain("review ledger was not exported for the current corpus");
    expect(changedIssues).toContain(
      `${changed.cases[0].id}: content changed after its listening disposition`,
    );

    // Pending content never merges, whatever the ledger currently holds.
    const unreviewed = structuredClone(ledger);
    unreviewed.reviews[0].disposition = "pending";
    unreviewed.reviews[0].grandfathered = false;
    const unreviewedIssues = musicalReviewGateIssues(corpus, unreviewed);
    expect(unreviewedIssues).toContain(`${corpus.cases[0].id}: pending content is not mergeable`);
    expect(unreviewedIssues).toContain(
      `${corpus.cases[0].id}: new or changed content requires explicit listening approval`,
    );

    const crossed = structuredClone(corpus);
    crossed.cases[0].metrics.handZoneGap = 0;
    expect(musicalReviewGateIssues(crossed, ledger)).toContain(
      `${crossed.cases[0].id}: the hands leave their own zones (gap 0)`,
    );

    const rejected = structuredClone(ledger);
    rejected.reviews[0].disposition = "rejected";
    rejected.reviews[0].reviewer = "QA pianist";
    expect(musicalReviewGateIssues(corpus, rejected)).toContain(
      `${corpus.cases[0].id}: rejected by QA pianist`,
    );
  });
});
