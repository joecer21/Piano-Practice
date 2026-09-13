# Learner experience design

The approved upgrade direction is a warm, low-light **Studio** theme with a warm **Paper** alternative. Studio is always the first-visit default; the two-way theme control does not follow the operating-system colour scheme. Interface chrome stays neutral, while hue is reserved for notes that are sounding in the left or right hand.

The learner-facing home is the **Stage**: assignment introduction, start action, keyboard and timeline, practice controls, and one compact Recent practice section. Supporting controls live in a modeless tool surface. It is a collapsible right panel at desktop widths, a right overlay on landscape tablets, and a bottom sheet capped at 70% of the viewport on narrower screens. Because the keyboard remains usable while the surface is open, the surface is not a modal dialog and does not trap focus or make the Stage inert. Escape and the close control dismiss it and return focus to its trigger.

The approved Phase 1 interactive mock-up was reviewed outside this repository and has not been exported into the workspace. Add its HTML or reference screenshots under `docs/design-reference/` when an export is available; do not substitute implementation screenshots and call them the approved source.

The icon implementation is a small inline React path set in `coach/Icon.tsx`. It adds no web request or offline-cache entry; it is not an SVG `<symbol>` sprite.

## Focus session and summary

A running or paused session is **focus mode**. `CoachApp` mirrors the session status onto `<main data-session-status>`, and CSS alone hides the tool rail, the tool panel, Recent practice, the assignment link and keyboard options. The keyboard, the timeline portal, the Tone transport, the sampler and held-note listeners stay mounted in every state. The session header becomes a focus bar: a large clock in the feel face, the step rail, the instruction in display type, and Pause/Resume, Previous, Next/Finish and End session. On desktop the tool panel's column is given back to the Stage while practising.

A completed session shows a **summary card**: time practised, what was covered, an optional note saved to that session's history record, and _Again, same assignment_, _Again in a new key_ or _Done_. There are no scores and no streaks.

## Feel-first wording

`coach/feel.ts` describes the assignment by how it sounds. It is presentation only: every phrase is read from the Score, so a custom progression or a new key is described just as truthfully, and `domain/describe.ts` still produces the theory sentence. The headline pairs a mood (one per mode) with the harmony's journey (a twelve-bar walk, a two-chord groove, starting away from home, always coming home, pulling round again, or circling back). The hands-apart view adds what the selected hand does. `tests/coach-feel.spec.js` pins the wording and checks that no preset ever produces theory vocabulary.
