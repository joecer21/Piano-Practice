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
npm run fingerprint    # Verify generated music against the frozen baseline
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
- `domain/score.ts` derives the canonical, runtime-validated musical event model consumed by presentation and, in the next slice, playback.
- `domain/score-query.ts` provides bar, part, chord, and pitch-classification queries over Score.
- `domain/describe.ts` turns Score facts into deterministic practice-coach language.
- `domain/random.js` provides the reproducible pseudo-random stream and derived seeds.
- `domain/live-piano.js` expands interactive keys into deterministic chord shapes.
- `application/state.js` owns assignment commits, bounded undo/redo history, and component locks without imposing a UI framework.
- `components/piano.js` renders the Live Piano and responds to playback note events.
- `main.js` coordinates UI state and playback.
- `audio.js` owns Tone.js instruments, sample loading, transport, mix, and effects.
- `engine.js`, `theory.js`, and `presets.js` generate the musical material.
- `ui.js` renders and wires the interface.
- `audio/local-samples.js` is the local sample manifest, free of Tone.js so it can be validated directly.
- `tests/*.spec.js` contains the Vitest contract suite.
- `tests/browser/` covers the practice flow and pins previously-shipped defects as user-visible behaviour.
- `tests/support/fingerprint.js` and `scripts/fingerprint.mjs` implement the musical fingerprint.

## Musical fingerprint

The engine is deterministic: a seed reproduces the same assignment. `npm run fingerprint`
hashes the generated music for the same 96-seed matrix the property tests use and compares it
against `tests/fixtures/musical-fingerprint.json`.

The hash covers musical facts only - pitches, onsets, durations, parts, bar indices and chord
voicings. It deliberately excludes labels, descriptions and property order, so presentation
changes do not produce diffs. It also excludes the assignment `id`, which is derived from
inputs rather than from notes and so cannot detect a change in generated material.

Six seeds are additionally kept as readable fixtures under `tests/fixtures/curated/` so a
failure can be read rather than merely detected.

A change to the generated music should be intentional: make it in its own commit, confirm only
the seeds you expect have moved, then re-freeze with `npm run fingerprint:write`.

## Continuous integration

GitHub Actions runs lint, formatting, unit tests, the fingerprint check, the production build,
and Playwright against that build. Pushes to `main` deploy the bundle to GitHub Pages. The
build uses a relative base, so the same artifact works at a domain root or under a project path.

Assignments are versioned, runtime-validated, and JSON-safe. Seeds reproduce the same input choices and stable assignment ID. The assignment workbench exposes deterministic rerolls, `key`/`harmony`/`groove`/`motif` locks, and bounded undo/redo history without changing the musical engine.

Each committed assignment also produces a derived Score with stable per-note IDs, numeric beat timing, structured degrees, chord roles, and exact expression intent. The piano roll reads this Score directly, so its displayed octaves now match the pitches sent to playback.
