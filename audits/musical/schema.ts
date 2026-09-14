import type { AssignmentInputs } from "../../domain/assignment.js";
import type { Score } from "../../domain/score.js";

export const MUSICAL_AUDIT_SCHEMA_VERSION = 1 as const;
export const MUSICAL_REVIEW_SCHEMA_VERSION = 1 as const;

export type AuditionMetrics = {
  leftHandRange: readonly [number, number] | null;
  rightHandRange: readonly [number, number] | null;
  closestConcurrentHandGap: number | null;
  widestConcurrentHandGap: number | null;
  /** Lowest right-hand note minus highest left-hand note: each hand's own zone. */
  handZoneGap: number | null;
  /** Largest jump of the bass between neighbouring bars, in semitones. */
  maxBassLeap: number;
  outsideCollectionNotes: readonly {
    eventId: string;
    beat: number;
    durationBeats: number;
    midi: number;
    degree: string;
    membership: "parentScale" | "chromatic";
    dynamic: string;
  }[];
  longNotes: readonly { eventId: string; part: "lh" | "rh"; beat: number; durationBeats: number }[];
};

export type MusicalAuditCase = {
  id: string;
  title: string;
  categories: readonly string[];
  tempoBpm: number;
  inputs: AssignmentInputs;
  seed: string;
  assignmentId: string;
  rationale: string;
  listenFor: readonly string[];
  summary: {
    keyAndCollection: string;
    progression: string;
    leftHand: string;
    motif: string;
  };
  musicalFingerprint: string;
  scoreFingerprint: string;
  caseFingerprint: string;
  score: Score;
  metrics: AuditionMetrics;
};

export type MusicalAuditCorpus = {
  schemaVersion: typeof MUSICAL_AUDIT_SCHEMA_VERSION;
  corpusFingerprint: string;
  cases: readonly MusicalAuditCase[];
};

export type ReviewDisposition = "pending" | "approved" | "rejected";

export type MusicalCaseReview = {
  caseId: string;
  disposition: ReviewDisposition;
  reviewer: string | null;
  reviewedAt: string | null;
  notes: string;
  caseFingerprint: string;
  musicalFingerprint: string;
  scoreFingerprint: string;
  /** Only cases already shipped before this gate was introduced may be pending. */
  grandfathered: boolean;
};

export type MusicalReviewLedger = {
  schemaVersion: typeof MUSICAL_REVIEW_SCHEMA_VERSION;
  corpusFingerprint: string;
  reviews: readonly MusicalCaseReview[];
};
