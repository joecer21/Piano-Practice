# 5-Minute Improv Coach

A browser-based piano practice coach that creates short improvisation assignments from a key, mode, progression, left-hand pattern, and motif. Playback uses a bundled Tone.js build and starts with the included local soft-piano samples, so the default experience does not depend on a sample CDN.

## Requirements

- Node.js 22.19 or newer
- npm
- A Chromium-based browser, Firefox, or Safari with Web Audio support

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Choose **Change the assignment** to load a ready-made preset or build a custom assignment. Edits stay in a draft until **Apply assignment**, so an incomplete custom progression cannot replace the music on screen. Browser audio begins after the first click, as required by modern autoplay policies.

The **Live Piano** renders C2-E6 on larger screens and a touch-friendly C3-C5 range on phones. It follows assignment playback with separate left- and right-hand colors and supports click/tap, an explicit gliss mode, roving arrow-key focus with Enter/Space, and opt-in A-W-S-E-D-F-T-G-Y-H-U-J-K note keys. Computer-key shortcuts pause while a form control has focus.

## Commands

```bash
npm run dev            # Vite development server
npm run build          # Production bundle in dist/
npm run preview        # Preview the production bundle
npm run lint           # ESLint
npm run format         # Prettier, write
npm run format:check   # Prettier, verify only
npm run typecheck      # Strict TypeScript checks for new typed modules
npm test               # Unit and DOM contract specs with Vitest
npm run test:watch     # Vitest watch mode
npm run test:browser   # Playwright, against the production bundle
npm run fingerprint    # Verify generated music and its Score interpretation against frozen baselines
npm run audit:music    # Verify the focused audition corpus and human review dispositions
npm run audit:music:write  # Regenerate corpus/report; never grants approval
npm run report:outside-collection  # Chord-aware motif compatibility review -> test-results/outside-collection-notes.md
npm run check          # Everything above, in the order CI runs it
```

Install the browser used by the smoke test once on a new machine:

```bash
npx playwright install chromium
```

## Audio libraries

The default **Piano Lite - Soft** model is served from `public/samples/`. **Piano HL - Bright** uses the bundled high-velocity sample layer. Fuhton Piano and Salamander Lite remain optional network-loaded choices in the model menu.

Sample filenames spell sharps with `s` (`ds3vl.mp3`), because a literal `#` in a URL begins a fragment. `audio/local-samples.js` holds the manifest and is kept free of Tone.js so `tests/samples.spec.js` can assert that every declared URL resolves to a real file and that nothing ships unreferenced.

## Project layout

- `domain/assignment.js` defines and validates the versioned assignment schema, orchestrates deterministic generation, and provides seeded rerolls.
- `domain/score.ts` derives the canonical, runtime-validated musical event model consumed by presentation and playback.
- `domain/score-query.ts` provides bar, part, chord, and pitch-classification queries over Score.
- `domain/describe.ts` turns Score facts into deterministic practice-coach language.
- `domain/random.js` provides the reproducible pseudo-random stream and derived seeds.
- `domain/live-piano.js` expands interactive keys into deterministic chord shapes.
- `coach/` is the React practice surface: the assignment workspace (`AssignmentWorkspace.tsx`), sound and playback settings (`SoundSettings.tsx`), scale reference and audition (`ScaleReference.tsx`), one-sentence summary and five-minute session (`CoachApp.tsx`), Score-drawn timeline (`Timeline.tsx`), degree and note-role overlay on the keyboard (`keyboard-overlay.ts`), and the pure request and playhead logic behind slow, loop and isolate (`practice.ts`). It reaches the rest of the app only through typed services in `bridge.ts`.
- `input/` is the single stream of notes the player plays, from any source: pointer, on-screen key, computer keys or MIDI (`note-input.ts`), the held and pedal-sustained state derived from it (`held-notes.ts`), and the Web MIDI adapter (`midi.ts`). It imports nothing from the app, UI or audio.
- `application/state.js` owns assignment commits, bounded undo/redo history, and component locks without imposing a UI framework; `application/app-controller.js` consolidates application startup and orchestration; `application/share-controller.ts` and `application/status.ts` own assignment-link behavior and shared feedback through observable, browser-independent services.
- `infrastructure/` contains browser-only adapters for localStorage, URL/hash changes, service-worker registration, and the single typed end-to-end diagnostic surface.
- `components/piano.js` renders the Live Piano and responds to playback note events; `components/piano-interactions.js` owns its framework-neutral focus, pointer and computer-key behavior.
- `main.js` is the small browser bootstrap. `application/app-controller.js` composes application services, owns their disposer stack, coordinates the piano, and requests playback without importing Tone.js.
- `audio/playback-engine.ts` owns validated Score playback requests, scheduled-event ownership, count-in, rate conversion, and session lifecycle.
- `audio.js` adapts that engine to Tone.js instruments, sample loading, transport, mix, and effects.
- `audition.html`, `audition/`, and `audits/musical/` provide the separate sequential listening tool, canonical audition corpus, review ledger, and readable report.
- `engine.js`, `theory.js`, and `presets.js` generate the musical material.
- `coach/StatusLine.tsx` renders the application status service. The practice, assignment, reference, sound and feedback surfaces are React-owned.
- `audio/local-samples.js` is the local sample manifest, free of Tone.js so it can be validated directly.
- `tests/*.spec.js` contains the Vitest contract suite.
- `tests/browser/` covers the practice flow and pins previously-shipped defects as user-visible behaviour.
- `tests/support/fingerprint.js` and `scripts/fingerprint.mjs` implement the musical fingerprint; `tests/support/score-fingerprint.js`, `tests/score-fingerprint.spec.js` and `scripts/score-fingerprint.mjs` implement the Score fingerprint; `tests/support/outside-collection.js` and `scripts/outside-collection-report.mjs` produce the outside-collection compatibility review.

The ownership and dependency rules are documented in [`docs/architecture.md`](docs/architecture.md). The listening workflow and release policy are documented in [`docs/musical-qa.md`](docs/musical-qa.md).

## Practising

**Start 5 minutes** runs a guided session: the whole thing, left hand, right hand, chord by chord, note by note, then free improvisation over the loop, with one line of instruction for each step. Time is shared 60/45/45/60/45/45 seconds, and a step whose time is up moves on at the next bar line rather than mid-bar. Sessions can also be 2 or 10 minutes, or untimed. The summary shows what was covered and offers the same assignment again, or the same material in a new key.

Outside a session the same four views are one click apart. **Hands apart** isolates a hand; selecting a bar loops it. **Chord by chord** marks the exact keys of each chord's voicing, dims everything outside the chord, and says why the chord is there ("V — the strongest pull back to home."). That wording comes from the chord's real distance from the key and its intervals, not from how the numeral is spelled. **Note by note** shows the motif as degrees and plays it with the right hand at half speed.

**Scale reference** shows the assignment's collection in note order and can audition it once or on a loop. The progression, left-hand pattern, and motif are already represented by the Score timeline and the focused practice views, so they do not have separate duplicate playback panels.

## Coming back, sharing, offline

**The address bar is always a share link.** Every committed assignment is written into the URL fragment (`#v=1&key=A&mode=minorBlues&…`), as readable fields: only the assignment's inputs, which the deterministic engine turns back into the same music. The fragment never reaches a server. `domain/share.ts` encodes and decodes it; a link is untrusted input, so decoding is strict (size limit, character whitelist, exact fields, a pattern per field, own-property catalog lookups, a roman-numeral grammar for custom chords) and ends with the same learner-facing check as the controls, so a link cannot open a motif its mode does not offer. A link that cannot be opened is explained, and the app opens normally.

**Star it, reopen it tomorrow.** Star, Share link and the Starred list sit below the keyboard. Share uses the device's share sheet where there is one, else copies the link. `application/library.ts` keeps starred assignments, the last assignment, the tempo, and the label and session-length preferences in this browser's `localStorage`, stored as share fragments and read back through the same decoder. Opening the app without a link returns to the last assignment.

**Offline after one visit.** The build writes `dist/sw.js` (`scripts/offline-plugin.mjs`), precaching the page, its hashed assets, the icons and the local piano samples under a version derived from their contents. Pages load network-first, so a deploy is picked up at once; everything else comes from the cache. The optional network piano libraries still need a connection. The page is installable (`public/manifest.webmanifest`) and has link-preview metadata; `node scripts/brand-assets.mjs` re-renders the PNG icons and preview image from `public/icons/icon.svg`.

## Playing along

The keyboard mirrors whatever you play. Mouse, touch, the focused on-screen key and computer keys all feed one note stream, and so does a MIDI keyboard once connected. Computer keys A W S E D F T G Y H U J K play one octave; Z and X move it.

**MIDI** is progressive enhancement. Nothing is requested until you press "Connect MIDI keyboard", because browsers prompt for permission. Keyboards plugged in later appear automatically; unplugging one mid-note releases its keys; the sustain pedal is honoured. By default MIDI notes are only mirrored, since most MIDI keyboards make their own sound; "Play through the app" also sounds them on the app's piano. Safari does not implement Web MIDI and pages must be served over https, so in those cases the app says so in one line and everything else keeps working. `tests/browser/midi.spec.js` drives a fake MIDIAccess, because real hardware cannot run in CI.

## Motif degrees

Motif patterns are written in degrees, the way a musician would say them, and read against the mode's seven-note parent scale: the scale itself for major and the minors, natural major for pentatonic major and major blues, natural minor for pentatonic minor and minor blues (the same mapping the chord engine uses).

- A plain number keeps the pattern's shape in every mode. `1 3 5 1` is C–E–G–C in C major, C–E♭–G–C in C minor (shown as `1 ♭3 5 1`), and A–C–E–A in A minor pentatonic.
- An altered token such as `♭3` is an absolute interval above home: a minor third in every mode, never a flat applied to a third that is already minor.
- A pattern marked `degreeInterpretation: "scale-step"` counts through the selected collection instead. Only genuine scalar runs use it: `scalar-run-8ths` in A minor pentatonic is A–C–D–E–G–A–C–D.
- A degree the collection leaves out (2 in minor pentatonic) is played from the parent scale, not replaced, and Score marks it as borrowed (`scaleMembership: "parentScale"`, role `parentScaleTone`). Note by note names it ("2 is borrowed from natural minor"). Whether it is a passing tone depends on how it is approached and left, so the app does not call it one.

Each pattern also declares how it fits each pentatonic and blues collection (`collectionFit` in `theory.js`):

- **strict**: every note is in the collection.
- **color**: deliberately uses named borrowed or chromatic tones (`colorTones`), which Note by note identifies.
- **incompatible**: structurally emphasizes a note that undermines the collection (on the downbeat, held, accented, or on a strong beat without resolving by step). It is not offered in that mode: the pattern menu disables it with the reason, rerolls skip it, and choosing it keeps the previous assignment with an explanation. Product code generates through `generateLearnerAssignment`, which refuses such a combination; the unrestricted `generateAssignment` remains for fingerprints, reports and tests, and ESLint forbids importing it from `main.js`, `presets.js`, `application/`, `components/` and `coach/`. It is never repaired by changing its notes; `variant` names a pattern written for that collection instead (`funk-sync-6`, `blues-riff-major`).

Some patterns exist only for particular collections (`modes`), such as `blues-riff-minor`, which features ♭5. Every collection has an `exemplar` pattern playing its characteristic tone: 6 in major pentatonic, ♭7 in minor pentatonic, ♭3 in major blues, ♭5 in minor blues. The seven-note modes offer the original fifteen patterns, unchanged. `npm run report:outside-collection` writes the review behind these declarations: for every outside-collection note, the chord under it and its role, metric position, duration, accent, the notes before and after, and its melodic function, plus the auditions that chose each variant. `tests/motif-compatibility.spec.js` checks each declaration against what the pattern actually plays, in every key.

Score degrees always name the pitch that sounds, so Note by note, the keyboard, the timeline and playback agree.

## Visual channels

The coach gives each musical fact one visual channel, so none can be mistaken for another. Hue means only which hand is sounding. Note role is fill weight: chord tones and the root are solid marks, scale tones are outlined, parent-scale passing tones are lighter and dashed, and notes outside the scale are unmarked. The root carries a heavier ring. Chord provenance (borrowed, secondary) is a text badge. In chord by chord, an ink bar marks each key of the voicing. What you play is a neutral ring on the key, solid while held and a thin double ring while it rings on the pedal, so your own notes are never mistaken for the assignment sounding. Interface controls use neutral ink, so no button can be read as a hand. `tests/browser/coach.spec.js` asserts this against computed styles.

## Fingerprints

The engine is deterministic: a seed reproduces the same assignment. Two frozen fingerprints
guard it, and `npm run fingerprint` checks both.

**Cases.** Both cover the 96 property seeds plus a fixed grid of every mode in C, F# and A#.
The grid exists because every property seed rerolls away from the defaults, so the seed matrix
alone never contains the default mode (major) or key (C).

**Musical fingerprint** (`tests/fixtures/musical-fingerprint.json`) hashes the generated
music: pitches, onsets, durations, parts, bar indices and chord voicings. Six seeds are kept
readable under `tests/fixtures/curated/`.

**Score fingerprint** (`tests/fixtures/score-fingerprint.json`) hashes how `Score`
interprets that music: note roles, scale degrees, dynamics, bar chords, roots and provenance.
The music fingerprint cannot see these, so a change such as renumbering degrees leaves it
untouched. Six cases chosen to cover the mode-dependent degree spellings are kept readable
under `tests/fixtures/curated-score/`, and a failure names the fields that changed in them
(for example `parts.lh[].role`). It runs under Vitest because `Score` is TypeScript.

Both exclude labels, descriptions, property order and the assignment `id`, which is derived
from inputs rather than from notes and so cannot detect a change in generated material.

They are frozen separately so an intended change to one does not re-freeze the other. Make the
change in its own commit, confirm only the cases and fields you expect have moved, then run
`npm run fingerprint:write-music` or `npm run fingerprint:write-score`.

### Musical listening gate

Fingerprints decide whether content changed; they do not decide whether it sounds good. The focused 27-case corpus in `audits/musical/corpus.json` retains every preset plus semantic, chromatic, custom-harmony, range and historical boundary cases as full canonical Scores. Open `/audition.html` from the development server or production preview to listen sequentially, isolate either hand, apply the six-question rubric, record approval or rejection, and export `audits/musical/reviews.json`.

The corpus generator never updates human dispositions. `npm run audit:music` fails if a case or its rationale changed after review, if a new case remains pending, or if a reviewer rejected it. Cases predating the gate are marked honestly as grandfathered and pending; they remain mergeable only while their exact content is unchanged. See [`docs/musical-qa.md`](docs/musical-qa.md) for the review procedure.

## Continuous integration

GitHub Actions runs lint, formatting, unit tests, the fingerprint and musical-review gates, the production build,
and Playwright against that build. Pushes to `main` deploy the bundle to GitHub Pages. The
build uses a relative base, so the same artifact works at a domain root or under a project path.

Assignments are versioned, runtime-validated, and JSON-safe. Seeds reproduce the same input choices and stable assignment ID. The assignment workbench exposes deterministic rerolls, `key`/`harmony`/`groove`/`motif` locks, and bounded undo/redo history without changing the musical engine.

Each committed assignment also produces a derived Score with stable per-note IDs, numeric beat timing, structured degrees, chord roles, and exact expression intent. The timeline reads this Score directly, so its displayed octaves match the pitches sent to playback.

Assignment playback is scheduled from that same Score through owned playback sessions. A session can be stopped without clearing another session's events, count-in sits outside the loop region, and rate changes stretch beat timing and duration without changing MIDI pitch or voicing. Humanization also remains in beat space until Tone schedules it, so tempo changes cannot desynchronize the groove.
