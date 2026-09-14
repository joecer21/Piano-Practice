# Musical terminology and adding content safely

The musical engine is deterministic and heavily guarded. This page explains the vocabulary the code and the learner-facing text use, and the procedure for adding a preset or motif without breaking reproducibility, shared links or the listening gate. The README's _Motif degrees_ section is the detailed reference for degree semantics.

## Terminology

| Term                    | Meaning in this app                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key**                 | The tonic pitch class (`C`, `F#`, …).                                                                                                                                                   |
| **Mode / collection**   | The note set practised: `major`, the minors, `pentatonicMajor`, `pentatonicMinor`, `majorBlues`, `minorBlues` (`SCALE_PATTERNS` in `theory.js`).                                        |
| **Parent scale**        | The seven-note scale a collection is read against: itself for major and minors; natural major for pentatonic major and major blues; natural minor for pentatonic minor and minor blues. |
| **Progression**         | A sequence of Roman-numeral chords, one per bar. Altered numerals (`♭VII`) are measured from the major scale.                                                                           |
| **Left-hand pattern**   | The accompaniment figure (`LEFT_HAND_PATTERN_METADATA`).                                                                                                                                |
| **Motif**               | A short right-hand pattern: rhythm plus degrees (`MOTIF_STYLES`).                                                                                                                       |
| **Degree**              | A plain number keeps the pattern's shape in the parent scale (`3` is minor in minor). An altered token (`♭3`) is an absolute interval above the tonic.                                  |
| **Scale-step motif**    | `degreeInterpretation: "scale-step"`: counts through the collection itself. Reserved for genuine scalar runs.                                                                           |
| **Borrowed note**       | A parent-scale degree the collection omits; Score marks it `scaleMembership: "parentScale"`, role `parentScaleTone`. Not automatically a passing tone.                                  |
| **Collection fit**      | Per motif and pentatonic/blues collection: `strict`, `color` (named colour tones) or `incompatible` (not offered; see `variant`).                                                       |
| **Characteristic tone** | The tone that makes a collection sound like itself: 6, ♭7, ♭3, ♭5. Each collection has an `exemplar` motif featuring it.                                                                |
| **Preset**              | A curated, named combination of key, mode, progression, style, length, left hand and motif (`presets.js`).                                                                              |
| **Score**               | The canonical, validated event model derived from an assignment. Everything visible and audible reads it.                                                                               |
| **Fingerprints**        | Hashes of the generated music and of Score's interpretation of it, frozen in `tests/fixtures/`.                                                                                         |

Learner-facing text is generated from Score facts (`domain/describe.ts`), never from how a numeral or motif label is spelled.

## Before you start

Any new catalog entry changes more than itself:

- **Seeded rerolls pick by position in the catalogs.** Adding a motif, progression or left-hand pattern changes what existing seeds reroll into, so the property-seed fingerprint cases will change. Share links and stored assignments are unaffected: they record explicit choices, and the engine regenerates the same music from them.
- The musical audit corpus includes **every preset automatically**, so a new preset is a new case awaiting review.

Plan for both in the same pull request.

## Adding a motif

1. Add the entry to `RAW_MOTIF_STYLES` in `theory.js`: `label`, `description`, `category`, `difficulty`, `bars`, a `rhythm` whose beats fill the bars, and `degreePattern` with one degree per sounding note.
2. Decide the degree reading. Use plain numbers unless the pattern is truly a scalar run; then add `degreeInterpretation: "scale-step"`.
3. Declare `collectionFit` for all four pentatonic and blues collections. Use `STRICT_IN_EVERY_COLLECTION` only if every note is in each one. For `color`, name the colour tones and why; for `incompatible`, give the learner-facing reason and, if one exists, a `variant` written for that collection. **Never make an incompatible pattern fit by changing its notes.** If it exists only for certain collections, add `modes`.
4. Run `npm run report:outside-collection` and read each outside-collection note in context (chord, metric position, duration, approach and departure).
5. `npm test`. `tests/motif-compatibility.spec.js` checks your declaration against what the pattern plays in every key. `tests/motif-degrees.spec.js` pins the degree semantics above; add a case there if your pattern relies on an unusual reading.
6. Continue with _Freezing the change_ below.

## Adding a preset

1. Add it to `PRESET_CONFIGS` in `presets.js`: a stable, never-reused `id`, `name`, the assignment fields, and optionally `anchors.rh`, the note the tune should sit around. Do not place the left hand: the engine gives it its own lanes under the tune (see _Where the hands sit_ below).
2. Choose only a motif the mode offers. Learner generation refuses anything else, so the preset would fail to open; check it in the running app.
3. `npm test`. `tests/presets.spec.js` checks the bar count, bar labels and that the tune's anchor is honoured; `tests/hand-lanes.spec.js` checks that the hands keep their own zones.
4. Continue with _Freezing the change_ below.

## Where the hands sit

Like a player, the engine chooses hand positions once for the piece and follows the chords by changing inversions, never octaves (`planHandLanes` and `generateLeftHandPattern` in `engine.js`):

- The tune is placed first, as one piece.
- The left hand gets a twelve-key **bass lane**, where each bass note has exactly one home, slid a few keys once per assignment so its edge falls where the progression moves least. Above it is a **chord lane** that stops two semitones below the tune's lowest note. Each pattern's `lane` in `LEFT_HAND_PATTERN_METADATA` says which shape the hand takes.
- Each chord is the inversion that fits the lane and moves least from the previous chord; a chord that comes round again is played where it was the first time. A chord that cannot fit is re-inverted, then thinned (over a sounding bass, the root goes first).
- When a low tune leaves no room, one decision is made for the whole piece: drop the lanes slightly, else lift the tune an octave, else drop the lanes further, never below A1.

`tests/hand-lanes.spec.js` holds this for every preset, hundreds of rerolls and every pattern under every tune: no shared or crossed keys, the drawn chord shape clear of the tune, no repeated chord moving, bass leaps within an octave (a fifth for presets), and nothing below A1. The musical audit gates on the same zone gap.

## Freezing the change

1. `npm run fingerprint`. Confirm that only the cases you expect changed, and why (typically catalog-driven reroll shifts). If an unrelated case changed, stop and investigate.
2. `npm run fingerprint:write-music` and/or `npm run fingerprint:write-score`, each in its own commit, with the reason in the message.
3. `npm run audit:music:write` to regenerate the corpus and report.
4. Listen: `npm run build && npm run preview`, open `/audition.html`, review every new or changed case against the six-question rubric, approve or reject with real notes, export, and replace `audits/musical/reviews.json` ([musical-qa.md](musical-qa.md)).
5. `npm run audit:music:write` again, then `npm run check`.

CI rejects the pull request if fingerprints moved without being re-frozen, or if any new or changed case lacks an approved listening disposition.

## Never

- Reuse or rename a preset `id`, motif id, progression id or left-hand id: shared links and stored assignments name them.
- Import `generateAssignment` into product code; use `generateLearnerAssignment` (ESLint enforces this).
- Re-freeze fingerprints in the same commit as an unrelated change.
