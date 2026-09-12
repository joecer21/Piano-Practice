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

The **Live Piano** renders C2-E6 and follows assignment playback with separate left- and right-hand colors. It can also be played directly with mouse or touch, including hover mode and single-note, diatonic, suspended, and extended chord shapes.

## Commands

```bash
npm run dev          # Vite development server
npm run build        # Production bundle in dist/
npm run preview      # Preview the production bundle
npm test             # All unit and DOM contract specs with Vitest
npm run test:watch   # Vitest watch mode
npm run test:browser # Playwright practice-flow smoke test
npm run check        # Unit tests, production build, and browser smoke test
```

Install the browser used by the smoke test once on a new machine:

```bash
npx playwright install chromium
```

## Audio libraries

The default **Piano Lite - Soft** model is served from `public/samples/`. **Piano HL - Bright** uses the bundled high-velocity sample layer. Fuhton Piano and Salamander Lite remain optional network-loaded choices in the model menu.

## Project layout

- `domain/assignment.js` defines and validates the versioned assignment schema, orchestrates deterministic generation, and provides seeded rerolls.
- `domain/random.js` provides the reproducible pseudo-random stream and derived seeds.
- `domain/live-piano.js` expands interactive keys into deterministic chord shapes.
- `application/state.js` owns assignment commits, bounded undo/redo history, and component locks without imposing a UI framework.
- `components/piano.js` renders the Live Piano and responds to playback note events.
- `main.js` coordinates UI state and playback.
- `audio.js` owns Tone.js instruments, sample loading, transport, mix, and effects.
- `engine.js`, `theory.js`, and `presets.js` generate the musical material.
- `ui.js` renders and wires the interface.
- `tests/*.spec.js` contains the Vitest contract suite.
- `tests/browser/practice-flow.spec.js` covers load, generate, play, stop, and model switching.

GitHub Actions runs the test suite, production build, and Chromium smoke test for pushes and pull requests.

Assignments are versioned, runtime-validated, and JSON-safe. Seeds reproduce the same input choices and stable assignment ID. The assignment workbench exposes deterministic rerolls, `key`/`harmony`/`groove`/`motif` locks, and bounded undo/redo history without changing the musical engine.
