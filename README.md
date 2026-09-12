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

Open the local URL printed by Vite. Choose a preset for a ready-made assignment, or select **Show Controls** to customize it. Browser audio begins after the first click, as required by modern autoplay policies.

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
- `coach/` is the practice surface, a React root layered over the page: the one-sentence summary and five-minute session (`CoachApp.tsx`), the Score-drawn timeline (`Timeline.tsx`), the degree and note-role overlay on the keyboard (`keyboard-overlay.ts`), and the pure request and playhead logic behind slow, loop and isolate (`practice.ts`). It reaches the rest of the app only through `bridge.ts`.
- `input/` is the single stream of notes the player plays, from any source: pointer, on-screen key, computer keys or MIDI (`note-input.ts`), the held and pedal-sustained state derived from it (`held-notes.ts`), and the Web MIDI adapter (`midi.ts`). It imports nothing from the app, UI or audio.
- `application/state.js` owns assignment commits, bounded undo/redo history, and component locks without imposing a UI framework.
- `components/piano.js` renders the Live Piano and responds to playback note events.
- `main.js` coordinates UI state and requests playback without importing Tone.js.
- `audio/playback-engine.ts` owns validated Score playback requests, scheduled-event ownership, count-in, rate conversion, and session lifecycle.
- `audio.js` adapts that engine to Tone.js instruments, sample loading, transport, mix, and effects.
- `engine.js`, `theory.js`, and `presets.js` generate the musical material.
- `ui.js` renders and wires the pre-coach controls, which now live in the "Change the assignment, sound and more" drawer until they are ported.
- `audio/local-samples.js` is the local sample manifest, free of Tone.js so it can be validated directly.
- `tests/*.spec.js` contains the Vitest contract suite.
- `tests/browser/` covers the practice flow and pins previously-shipped defects as user-visible behaviour.
- `tests/support/fingerprint.js` and `scripts/fingerprint.mjs` implement the musical fingerprint; `tests/support/score-fingerprint.js`, `tests/score-fingerprint.spec.js` and `scripts/score-fingerprint.mjs` implement the Score fingerprint.

## Practising

**Start 5 minutes** runs a guided session: the whole thing, left hand, right hand, chord by chord, note by note, then free improvisation over the loop, with one line of instruction for each step. Time is shared 60/45/45/60/45/45 seconds, and a step whose time is up moves on at the next bar line rather than mid-bar. Sessions can also be 2 or 10 minutes, or untimed. The summary shows what was covered and offers the same assignment again, or the same material in a new key.

Outside a session the same four views are one click apart. **Hands apart** isolates a hand; selecting a bar loops it. **Chord by chord** marks the exact keys of each chord's voicing, dims everything outside the chord, and says why the chord is there ("V — the strongest pull back to home."). That wording comes from the chord's real distance from the key and its intervals, not from how the numeral is spelled. **Note by note** shows the motif as degrees and plays it with the right hand at half speed.

## Playing along

The keyboard mirrors whatever you play. Mouse, touch, the focused on-screen key and computer keys all feed one note stream, and so does a MIDI keyboard once connected. Computer keys A W S E D F T G Y H U J K play one octave; Z and X move it.

**MIDI** is progressive enhancement. Nothing is requested until you press "Connect MIDI keyboard", because browsers prompt for permission. Keyboards plugged in later appear automatically; unplugging one mid-note releases its keys; the sustain pedal is honoured. By default MIDI notes are only mirrored, since most MIDI keyboards make their own sound; "Play through the app" also sounds them on the app's piano. Safari does not implement Web MIDI and pages must be served over https, so in those cases the app says so in one line and everything else keeps working. `tests/browser/midi.spec.js` drives a fake MIDIAccess, because real hardware cannot run in CI.

## Visual channels

The coach gives each musical fact one visual channel, so none can be mistaken for another. Hue means only which hand is sounding. Note role is fill weight: chord tones and the root are solid marks, scale tones are outlined, and notes outside the scale are unmarked. The root carries a heavier ring. Chord provenance (borrowed, secondary) is a text badge. In chord by chord, an ink bar marks each key of the voicing. What you play is a neutral ring on the key, solid while held and a thin double ring while it rings on the pedal, so your own notes are never mistaken for the assignment sounding. Interface controls use neutral ink, so no button can be read as a hand. `tests/browser/coach.spec.js` asserts this against computed styles.

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

## Continuous integration

GitHub Actions runs lint, formatting, unit tests, the fingerprint check, the production build,
and Playwright against that build. Pushes to `main` deploy the bundle to GitHub Pages. The
build uses a relative base, so the same artifact works at a domain root or under a project path.

Assignments are versioned, runtime-validated, and JSON-safe. Seeds reproduce the same input choices and stable assignment ID. The assignment workbench exposes deterministic rerolls, `key`/`harmony`/`groove`/`motif` locks, and bounded undo/redo history without changing the musical engine.

Each committed assignment also produces a derived Score with stable per-note IDs, numeric beat timing, structured degrees, chord roles, and exact expression intent. The piano roll reads this Score directly, so its displayed octaves now match the pitches sent to playback.

Assignment playback is scheduled from that same Score through owned playback sessions. A session can be stopped without clearing another session's events, count-in sits outside the loop region, and rate changes stretch beat timing and duration without changing MIDI pitch or voicing. Humanization also remains in beat space until Tone schedules it, so tempo changes cannot desynchronize the groove.
