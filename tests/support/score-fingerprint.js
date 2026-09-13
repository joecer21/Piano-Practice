// Score fingerprint: a stable hash over the facts Score derives from an assignment.
//
// The musical fingerprint guards the generated music. It cannot see how Score
// interprets that music - roles, degrees, provenance, bar chords - so a change
// there (such as renumbering degrees) left it untouched. This covers that half.
//
// Kept separate from the musical fingerprint so an intended change to Score's
// interpretation can be re-frozen without also re-freezing the music.
//
// Loads domain/score.ts, so it runs under Vitest, which resolves TypeScript.

import { createHash } from "node:crypto";
import { buildScore } from "../../domain/score.ts";
import { assignmentForCase, fingerprintCaseIds, stableStringify } from "./fingerprint.js";

/**
 * Facts only. Excluded: sourceAssignmentId (derived from inputs, like the
 * assignment id), schemaVersion, and chordSymbol (display text; the chord itself
 * is captured by its pitch classes, root and voicing).
 */
export function scoreFacts(score) {
  return {
    meta: {
      bars: score.meta.bars,
      beatsPerBar: score.meta.beatsPerBar,
      key: score.meta.key,
      mode: score.meta.mode,
      rootPitchClass: score.meta.rootPitchClass,
      scalePitchClasses: [...score.meta.scalePitchClasses],
      parentScalePitchClasses: [...score.meta.parentScalePitchClasses],
      rhCycleBeats: score.meta.rhCycleBeats,
      totalBeats: score.meta.totalBeats,
    },
    bars: score.bars.map((bar) => ({
      barIndex: bar.barIndex,
      startBeat: bar.startBeat,
      roman: bar.roman,
      chordPitchClasses: [...bar.chordPitchClasses],
      rootPitchClass: bar.rootPitchClass,
      voicingMidis: { chord: [...bar.voicingMidis.chord], bass: [...bar.voicingMidis.bass] },
      provenance: { ...bar.provenance },
    })),
    parts: Object.fromEntries(
      ["lh", "rh"].map((part) => [
        part,
        score.parts[part].map((event) =>
          event.kind === "rest"
            ? {
                id: event.id,
                kind: event.kind,
                barIndex: event.barIndex,
                startBeat: event.startBeat,
                durationBeats: event.durationBeats,
              }
            : {
                id: event.id,
                kind: event.kind,
                barIndex: event.barIndex,
                startBeat: event.startBeat,
                durationBeats: event.durationBeats,
                midi: event.midi,
                role: event.role,
                scaleMembership: event.scaleMembership,
                degree: event.degree ? { ...event.degree } : null,
                dynamic: event.dynamic,
                expression: { ...event.expression },
              },
        ),
      ]),
    ),
  };
}

export function scoreFactsForCase(caseId) {
  return scoreFacts(buildScore(assignmentForCase(caseId)));
}

export function scoreFingerprint(facts) {
  return createHash("sha256").update(stableStringify(facts)).digest("hex").slice(0, 16);
}

export function scoreFingerprintMatrix(caseIds = fingerprintCaseIds()) {
  return Object.fromEntries(caseIds.map((caseId) => [caseId, scoreFingerprint(scoreFactsForCase(caseId))]));
}
