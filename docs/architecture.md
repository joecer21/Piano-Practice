# Application architecture

The application is an incremental React migration around a deliberately preserved musical engine and framework-neutral piano renderer.

## Dependency direction

```text
coach (React UI)
  -> application commands and observable services
    -> domain rules and infrastructure ports
      -> browser, storage, URL, MIDI and audio adapters
```

- `domain/` owns deterministic musical and serialization rules. It does not access React, the DOM, browser storage, location, MIDI or audio.
- `application/` owns assignment, sharing, library and practice behavior. Browser capabilities arrive through small ports.
- `infrastructure/` owns browser-only mechanisms such as localStorage, the address bar, service-worker registration and end-to-end diagnostics. It does not decide musical meaning.
- `coach/` renders the workflow and calls typed services from `coach/bridge.ts`.
- `components/piano.js` and `components/piano-interactions.js` remain framework-neutral because the imperative keyboard layout, focus and input handling are the main justified direct-DOM surface. The only other direct-DOM code is small, documented accessibility and focus utilities such as `coach/sticky-offset.ts`.
- `audio/` accepts Score playback requests and imports neither UI nor application state.
- `audits/musical/` owns the generated listening corpus and human review ledger; the separate `audition/` React entry point consumes them without entering the learner application dependency graph.

ESLint enforces the most important negative dependencies for learner-facing generation, audio and input code.

## Composition and lifecycle

`main.js` is only the browser bootstrap: it starts the application after the DOM is ready and owns hot-reload teardown. `application/app-controller.js` composes the store, repositories, browser adapters, audio services and React bridge, and consolidates assignment, playback and guided-session orchestration. Every long-lived subscription or DOM listener created during startup returns an unsubscribe function owned by its runtime disposer stack. React bridge subscriptions are disposed when the root unmounts, and the same teardown runs during Vite hot replacement.

Shared feedback is an observable application service in `application/status.ts`, rendered by React in `coach/StatusLine.tsx`. It is priority-aware, so background sample-loading messages cannot erase a transient actionable hint.

## URL and storage

`domain/share.ts` owns the strict, versioned assignment fragment codec. `application/share-controller.ts` decides when a fragment should open or remember an assignment. `infrastructure/share-location.ts` is the only production module that reads or writes the browser address bar.

`application/library.ts` owns the versioned library schema, its v1-to-v2 migration, and storage failure containment. It applies every change to a fresh read so tabs cannot erase each other, refreshes when `infrastructure/browser-storage.ts` reports a change from another tab, and never overwrites a library written by a newer version. It receives a storage port; `infrastructure/browser-storage.ts` is the only module that obtains `window.localStorage`. The migration policy is in [`storage.md`](storage.md). `application/practice-record.ts` owns the separate runtime-validated practice-record and history-export contracts plus deterministic, explainable recommendations. The coach reports only explicit session state and manual annotations to that boundary; note or MIDI input is never interpreted as assessment.

## Offline and updates

`infrastructure/pwa.ts` registers the generated service worker and exposes an observable offline service: whether the app is ready offline, the cache version, and whether a newer version is waiting. The coach renders it through `bridge.offline` in `coach/UpdateNotice.tsx` and never reloads on its own. The worker (`offline/service-worker.js`) decides caching; it has no knowledge of musical content or application state. See [`offline-and-updates.md`](offline-and-updates.md).

## End-to-end diagnostics

Browser tests observe runtime state through the single typed `window.__PIANO_PRACTICE_TEST__` surface created by `infrastructure/test-adapter.ts`. Production behavior never reads this surface. Sampler, transport and play-request observations are written through the adapter rather than scattered globals.

## Change rules

- Preserve assignment/share compatibility and all musical fingerprints unless a musical audit and listening approval accompany the change.
- Keep every slice runnable, testable and deployable.
- Add browser mechanisms behind infrastructure ports rather than reading globals in application code.
- Do not replace the deterministic engine, Score generator or piano renderer without a demonstrated requirement.
- Keep `main.js` free of feature decisions; new behavior belongs in an application service/controller or a UI component.
