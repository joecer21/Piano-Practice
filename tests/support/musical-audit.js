import { createHash } from "node:crypto";
import { generateLearnerAssignment } from "../../domain/assignment.js";
import { formatDegreeToken } from "../../domain/describe.ts";
import { buildScore } from "../../domain/score.ts";
import { MUSICAL_AUDIT_SCHEMA_VERSION, MUSICAL_REVIEW_SCHEMA_VERSION } from "../../audits/musical/schema.ts";
import { musicalAuditCaseDefinitions, musicalAuditInputSummary } from "../../audits/musical/cases.js";
import { fingerprint, stableStringify } from "./fingerprint.js";
import { scoreFacts, scoreFingerprint } from "./score-fingerprint.js";

const digest = (value) => createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);

// Exact case records that predate the gate. Pending is allowed only while these
// hashes remain unchanged; new cases cannot opt themselves into grandfathering.
const INITIAL_PENDING_BASELINE = Object.freeze({
  "preset:pop-c": "110706781ab6679a",
  "preset:blues-a": "3852bd5e5ff57ea3",
  "preset:classical-f": "f696afddeed2f64c",
  "preset:lofi-d": "0522cd859c9cc98d",
  "preset:jazz-bb": "9d4322d25f4e1a84",
  "preset:harmonic-e": "e6c2f8e3fea292df",
  "preset:modal-g": "5e891dbacd181ac0",
  "preset:pent-c": "f981d751b1ec630b",
  "preset:ned-shearon": "fd2d966c6a80bf66",
  "preset:verde-dia": "a6b49fc257142dc9",
  "preset:coldplayer": "8a2e008e52157e94",
  "preset:tayla-swift": "a97d2c2e50f68519",
  "preset:billie-eyelash": "37a198c9a5e96cd2",
  "preset:brunho-bars": "f8ed98c605da4dbd",
  "preset:daft-ponk": "ad90e1e1b36e0228",
  "preset:john-legendairy": "20896bc947811470",
  "semantics:parent-degree-minor-pentatonic": "3fd2bc308a516583",
  "semantics:scale-step-minor-pentatonic": "e14859d9a04ff6ce",
  "collection:major-pentatonic-exemplar": "6f89dcbc0d5a3852",
  "collection:major-blues-exemplar": "e2a4533f49709cd2",
  "semantics:major-blues-major-third": "cb16fe90683f75a4",
  "color:major-pentatonic-modal-fourth": "6af39bed13bfa4b5",
  "harmony:custom-borrowed-cadence": "8ea84c66bc7dce5c",
  "boundary:narrow-hands-property-60": "ac5c6bb11ff80c89",
  "boundary:wide-hands-property-22": "8c2bc5e02b37e2d1",
  "historical:three-beat-duration-property-4": "cb4ee2d69fcd223d",
  "historical:four-beat-duration-property-24": "54f2b8e26550bc20",
});

const noteEvents = (score, part) => score.parts[part].filter((event) => event.kind === "note");

function range(events) {
  if (!events.length) return null;
  const midis = events.map((event) => event.midi);
  return [Math.min(...midis), Math.max(...midis)];
}

function concurrentHandGaps(score) {
  const left = noteEvents(score, "lh");
  const right = noteEvents(score, "rh");
  const gaps = [];
  for (const rh of right) {
    const soundingLeft = left.filter(
      (lh) => lh.startBeat <= rh.startBeat && lh.startBeat + lh.durationBeats > rh.startBeat,
    );
    soundingLeft.forEach((lh) => gaps.push(rh.midi - lh.midi));
  }
  return gaps;
}

export function auditionMetrics(score) {
  const left = noteEvents(score, "lh");
  const right = noteEvents(score, "rh");
  const gaps = concurrentHandGaps(score);
  const all = [
    ...left.map((event) => ({ ...event, part: "lh" })),
    ...right.map((event) => ({ ...event, part: "rh" })),
  ];
  return {
    leftHandRange: range(left),
    rightHandRange: range(right),
    closestConcurrentHandGap: gaps.length ? Math.min(...gaps) : null,
    widestConcurrentHandGap: gaps.length ? Math.max(...gaps) : null,
    outsideCollectionNotes: right
      .filter((event) => event.scaleMembership !== "collection")
      .map((event) => ({
        eventId: event.id,
        beat: event.startBeat,
        durationBeats: event.durationBeats,
        midi: event.midi,
        degree: event.degree ? formatDegreeToken(event.degree) : "?",
        membership: event.scaleMembership,
        dynamic: event.dynamic,
      })),
    longNotes: all
      .filter((event) => event.durationBeats >= 3)
      .map((event) => ({
        eventId: event.id,
        part: event.part,
        beat: event.startBeat,
        durationBeats: event.durationBeats,
      })),
  };
}

export function buildMusicalAuditCase(definition) {
  const assignment = generateLearnerAssignment(definition.inputs);
  const score = buildScore(assignment);
  const facts = {
    id: definition.id,
    title: definition.title,
    categories: definition.categories,
    tempoBpm: definition.tempoBpm,
    inputs: assignment.inputs,
    seed: assignment.seed,
    assignmentId: assignment.id,
    rationale: definition.rationale,
    listenFor: definition.listenFor,
    summary: musicalAuditInputSummary(assignment.inputs),
    musicalFingerprint: fingerprint(assignment),
    scoreFingerprint: scoreFingerprint(scoreFacts(score)),
    score,
    metrics: auditionMetrics(score),
  };
  return { ...facts, caseFingerprint: digest(facts) };
}

export function buildMusicalAuditCorpus() {
  const cases = musicalAuditCaseDefinitions().map(buildMusicalAuditCase);
  return {
    schemaVersion: MUSICAL_AUDIT_SCHEMA_VERSION,
    corpusFingerprint: digest(cases.map((entry) => [entry.id, entry.caseFingerprint])),
    cases,
  };
}

/**
 * The gate is deliberately separate from corpus generation. Rebuilding Scores
 * cannot update a human disposition, and rejected content never passes.
 */
export function musicalReviewGateIssues(corpus, ledger) {
  const issues = [];
  if (ledger?.schemaVersion !== MUSICAL_REVIEW_SCHEMA_VERSION) {
    issues.push(`review ledger schema must be ${MUSICAL_REVIEW_SCHEMA_VERSION}`);
  }
  if (ledger?.corpusFingerprint !== corpus.corpusFingerprint) {
    issues.push("review ledger was not exported for the current corpus");
  }

  const reviews = new Map((ledger?.reviews || []).map((review) => [review.caseId, review]));
  const cases = new Map(corpus.cases.map((entry) => [entry.id, entry]));
  for (const entry of corpus.cases) {
    const review = reviews.get(entry.id);
    if (!review) {
      issues.push(`${entry.id}: missing listening disposition`);
      continue;
    }
    if (
      review.caseFingerprint !== entry.caseFingerprint ||
      review.musicalFingerprint !== entry.musicalFingerprint ||
      review.scoreFingerprint !== entry.scoreFingerprint
    ) {
      issues.push(`${entry.id}: content changed after its listening disposition`);
    }
    if (review.disposition === "rejected") {
      issues.push(`${entry.id}: rejected by ${review.reviewer || "an unnamed reviewer"}`);
    } else if (review.disposition === "pending") {
      if (!review.grandfathered) issues.push(`${entry.id}: pending content is not mergeable`);
      if (INITIAL_PENDING_BASELINE[entry.id] !== entry.caseFingerprint) {
        issues.push(`${entry.id}: new or changed content requires explicit listening approval`);
      }
      if (!review.notes?.trim()) issues.push(`${entry.id}: pending baseline needs an explanatory note`);
    } else if (review.disposition === "approved") {
      if (!review.reviewer?.trim()) issues.push(`${entry.id}: approval needs a reviewer`);
      if (!review.reviewedAt || Number.isNaN(Date.parse(review.reviewedAt))) {
        issues.push(`${entry.id}: approval needs a valid review date`);
      }
      if (!review.notes?.trim()) issues.push(`${entry.id}: approval needs reviewer notes`);
      if (review.notes?.startsWith("Grandfathered unchanged content")) {
        issues.push(`${entry.id}: approval needs actual listening notes, not the baseline placeholder`);
      }
    } else {
      issues.push(`${entry.id}: unknown disposition ${String(review.disposition)}`);
    }
  }
  for (const caseId of reviews.keys()) {
    if (!cases.has(caseId)) issues.push(`${caseId}: review has no matching audition case`);
  }
  return issues;
}

export function renderMusicalAuditReport(corpus, ledger) {
  const reviews = new Map(ledger.reviews.map((review) => [review.caseId, review]));
  const approved = ledger.reviews.filter((review) => review.disposition === "approved").length;
  const rejected = ledger.reviews.filter((review) => review.disposition === "rejected").length;
  const lines = [
    "# Musical audition report",
    "",
    `Corpus: \`${corpus.corpusFingerprint}\` · ${corpus.cases.length} cases · ${approved} approved · ${rejected} rejected · ${corpus.cases.length - approved - rejected} pending`,
    "",
    "Open `audition.html` from the production build for sequential listening, review notes, and ledger export.",
    "",
    "## Rubric",
    "",
    "- Does the melody agree with the harmony?",
    "- Are accented outside-scale notes intentional?",
    "- Are hand positions playable?",
    "- Does the style sound recognizable?",
    "- Are repetitions useful rather than mechanical?",
    "- Is the assignment appropriate for the stated learner level?",
    "",
  ];
  for (const entry of corpus.cases) {
    const review = reviews.get(entry.id);
    lines.push(
      `## ${entry.title}`,
      "",
      `- ID: \`${entry.id}\``,
      `- Seed: \`${entry.seed}\``,
      `- Musical fingerprint: \`${entry.musicalFingerprint}\``,
      `- Score fingerprint: \`${entry.scoreFingerprint}\``,
      `- Disposition: **${review?.disposition ?? "missing"}**${review?.reviewer ? ` — ${review.reviewer}` : ""}`,
      `- Rationale: ${entry.rationale}`,
      `- Listen for: ${entry.listenFor.join("; ")}`,
      `- Notes: ${review?.notes || "None"}`,
      "",
    );
  }
  return lines.join("\n");
}
