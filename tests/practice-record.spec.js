import { describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_INPUTS, normalizeAssignmentInputs } from "../domain/assignment.js";
import { encodeShareFragment } from "../domain/share.ts";
import {
  PRACTICE_APPLICATION_VERSION,
  createPracticeRecord,
  exportPracticeHistory,
  finishPracticeRecord,
  parsePracticeHistoryExport,
  parsePracticeRecord,
  recommendPractice,
  updatePracticeProgress,
} from "../application/practice-record.ts";

const fragment = encodeShareFragment(normalizeAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS));

function record(id = "practice-one", startedAt = new Date("2026-01-01T12:00:00.000Z")) {
  return createPracticeRecord({ id, fragment, title: "C major", tempo: 90, startedAt });
}

describe("practice record schema", () => {
  it("creates a versioned JSON-safe record and normalizes progress", () => {
    const created = updatePracticeProgress(record(), {
      activeDurationMs: 1234.4,
      endingTempo: 95,
      handsPractised: ["right", "left", "right"],
      barsVisited: [4, 2, 4],
      learningLenses: ["notes", "whole", "notes"],
      needsWorkBars: [4, 2, 4],
      label: "  Bridge work  ",
      notes: "Keep the top voice clear.",
    });

    expect(created).toMatchObject({
      schemaVersion: 1,
      applicationVersion: PRACTICE_APPLICATION_VERSION,
      status: "incomplete",
      completedAt: null,
      activeDurationMs: 1234,
      endingTempo: 95,
      handsPractised: ["right", "left"],
      barsVisited: [2, 4],
      needsWorkBars: [2, 4],
      label: "Bridge work",
    });
    expect(parsePracticeRecord(JSON.parse(JSON.stringify(created)))).toEqual(created);
    expect(JSON.stringify(created)).not.toContain("accuracy");
  });

  it("rejects malformed fields and invalid assignment payloads", () => {
    const good = record();
    for (const broken of [
      { ...good, schemaVersion: 2 },
      { ...good, id: "bad id" },
      { ...good, assignment: { ...good.assignment, fragment: "v=1&nope=true" } },
      { ...good, activeDurationMs: -1 },
      { ...good, startingTempo: 999 },
      { ...good, handsPractised: ["both"] },
      { ...good, status: "completed", completedAt: null },
      { ...good, barsVisited: [0] },
    ]) {
      expect(parsePracticeRecord(broken)).toBeNull();
    }
  });

  it("clamps completion when the system clock moved backwards", () => {
    const completed = finishPracticeRecord(record(), "completed", new Date("2025-01-01T00:00:00.000Z"));
    expect(completed.completedAt).toBe(completed.startedAt);
    expect(parsePracticeRecord(completed)).toEqual(completed);
  });

  it("round-trips exports and rejects partial or corrupt imports", () => {
    const records = [finishPracticeRecord(record(), "completed", new Date("2026-01-01T12:05:00Z"))];
    const json = exportPracticeHistory(records, new Date("2026-02-01T00:00:00Z"));
    expect(parsePracticeHistoryExport(json)).toEqual(records);
    expect(parsePracticeHistoryExport("{bad json")).toBeNull();
    expect(parsePracticeHistoryExport("x".repeat(2_000_001))).toBeNull();
    expect(parsePracticeHistoryExport(JSON.stringify({ schemaVersion: 1, records }))).toBeNull();
  });
});

describe("practice recommendations", () => {
  const now = new Date("2026-02-01T12:00:00Z");

  it("prioritizes incomplete work, then manually marked bars", () => {
    const incomplete = record("incomplete", new Date("2026-01-31T12:00:00Z"));
    const marked = updatePracticeProgress(
      finishPracticeRecord(record("marked"), "completed", new Date("2026-01-01T12:05:00Z")),
      { needsWorkBars: [3] },
    );
    expect(recommendPractice([marked, incomplete], now, 7)).toMatchObject({
      kind: "resume",
      recordId: "incomplete",
    });
    expect(recommendPractice([marked], now, 7)).toMatchObject({ kind: "marked-bar", bar: 3 });
  });

  it("recommends due review before a new key and never changes tempo", () => {
    const old = finishPracticeRecord(record("old"), "completed", new Date("2026-01-01T12:05:00Z"));
    expect(recommendPractice([old], now, 7)).toMatchObject({ kind: "revisit", recordId: "old" });
    const recent = finishPracticeRecord(
      record("recent", new Date("2026-01-31T12:00:00Z")),
      "completed",
      new Date("2026-01-31T12:05:00Z"),
    );
    const suggestion = recommendPractice([recent], now, 7);
    expect(suggestion).toMatchObject({ kind: "new-key", recordId: "recent" });
    expect(suggestion).not.toHaveProperty("tempo");
  });
});
