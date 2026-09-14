# Musical QA release gate

Automated tests can prove that an assignment is structurally valid and unchanged. They cannot decide whether it is convincing music. The musical QA gate binds every intentionally auditioned case to its exact assignment, canonical Score, two fingerprints, listening rationale and human disposition.

## Audition corpus

`audits/musical/cases.js` defines the stable cases. The generated `corpus.json` retains the complete JSON-safe Score for each one, along with its input, seed, musical fingerprint, Score fingerprint, rationale, listening prompts, pitch ranges, concurrent hand gaps, the gap between the hands' zones, the largest bass leap, outside-collection notes and long notes. The gate also refuses any case whose hands leave their own zones.

The corpus includes:

- every curated preset;
- all four pentatonic and blues collections;
- paired parent-degree and scale-step examples;
- passing tones, borrowed notes and accented color notes;
- a custom progression with secondary and borrowed harmony;
- narrow and wide hand-spacing boundaries;
- the historical three- and four-beat duration regressions;
- representative keys, styles, patterns and fixed seeds.

## Listening workflow

1. Run `npm run audit:music:write` after an intentional musical, Score, preset or corpus change. This regenerates `corpus.json` and `report.md`; it never updates a review disposition.
2. Run `npm run build && npm run preview`, then open `/audition.html`.
3. Listen to both hands and isolate either hand where useful. For each affected or new case, enter the reviewer name and real listening notes, then approve or reject it.
4. Export the ledger and replace `audits/musical/reviews.json` with the downloaded `musical-review.json`.
5. Run `npm run audit:music:write` once more to refresh the readable report, then run `npm run audit:music`.

The review page keeps in-progress work in local browser storage. Exported approval records the current case, musical and Score fingerprints. Rejected content fails the gate. New or changed pending content fails the gate. Regenerating the corpus alone therefore cannot manufacture human approval.

The 27 cases that existed when this gate was introduced are honestly marked as grandfathered and pending. They may merge only while their exact content and rationale remain unchanged. Changing one invalidates its baseline disposition; approving it requires a named reviewer, a timestamp and replacement of the baseline placeholder with actual listening notes.

## Rubric

- Does the melody agree with the harmony?
- Are accented outside-scale notes intentional?
- Are hand positions playable?
- Does the style sound recognizable?
- Are repetitions useful rather than mechanical?
- Is the assignment appropriate for the stated learner level?

## Files and enforcement

- `cases.js`: reviewed case intent and stable inputs.
- `corpus.json`: generated canonical assignments, Scores and fingerprints.
- `reviews.json`: human-owned dispositions; never generated during ordinary corpus updates.
- `report.md`: concise, readable snapshot for code review.
- `tests/musical-audit.spec.js`: exact corpus and disposition gate.
- `/audition.html`: sequential listening and review tool, emitted as a separate production entry point so its large Score corpus does not inflate the practice application bundle.

`npm run check` and GitHub Actions both run the named audit gate. No curated musical-content or fingerprint change should merge until the ledger matches the new corpus and every affected case has an explicit approved disposition.
