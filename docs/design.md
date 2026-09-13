# Learner experience design

The approved upgrade direction is a warm, low-light **Studio** theme with a warm **Paper** alternative. Studio is always the first-visit default; the two-way theme control does not follow the operating-system colour scheme. Interface chrome stays neutral, while hue is reserved for notes that are sounding in the left or right hand.

The approved Phase 1 interactive mock-up is kept at [`docs/design-reference/phase-1-mockup.html`](design-reference/phase-1-mockup.html) (open it in a browser; it switches screen, device and theme). It is the visual source of truth: compare implementation screenshots against it, never the other way round.

The icon implementation is a small inline React path set in `coach/Icon.tsx`. It adds no web request or offline-cache entry.

## Stage

- **Header:** title, then the tools (_Change assignment_, _Shapes & scale_, _Sound_, _MIDI_ showing the connected keyboard's name), a divider, and icon buttons for _Star & share_, _Share link_ and the theme.
- **Brief:** an eyebrow (_Today · First Pop Improv in C_), the feel headline in italic serif (`data-testid="coach-feel"`), a line on what each hand does, and the theory sentence in a quieter monospace "In theory" row with _Why it works_ on request. Beside it is the start block: _Start 5 minutes_, a segmented session length and a one-line description of the steps.
- **Hero:** one sunken keybed holding the transport (Play, Half speed, Loop, tempo), the hand lens (Both / Left hand / Right hand), the breakdown views and key labels, then the piano roll with its bar buttons, the keyboard, the current view's detail and a legend in feel words. The controls are portalled into static slots in `index.html`, so the piano DOM contract is unchanged.
- **Recent practice:** one heading, a pick-up card, _Full history_ opening the records in place (never copied into the tool panel), and an overflow menu for revisit interval, export, import and clear.

Supporting tools live in a modeless surface: a right column at desktop widths, a right overlay on landscape tablets, and a bottom sheet capped at 72% of the viewport on narrower screens. The mock-up dims the Stage behind the tablet overlay; the implementation leaves it undimmed and usable, because the keyboard keeps playing while you choose. Escape and the close control dismiss it and return focus to its trigger.

The assignment panel lists presets by feel first (`PRESET_FEELS` in `coach/feel.ts`), then _Shape it yourself_: key, colour, chords, left hand, tune, style and length, each lockable part with its lock beside it, _Surprise me_, undo and redo, and a sticky _Apply assignment_ footer. Presets apply at once; your own changes wait for Apply.

## Focus session and summary

A running or paused session is **focus mode**. `CoachApp` mirrors the session status onto `<main data-session-status>`, and CSS alone hides the tools, the tool panel, the brief, Recent practice and keyboard options. The header shows the clock (_left of 5:00_ or _Paused_), _Next step_ and _End session_. The Stage shows the step rail, sized by each step's real length, the step name in italic serif with the time left in it, and the instruction. The transport's main button becomes _Pause_ / _Resume_ for the session. The keyboard, the timeline, the Tone transport, the sampler and held-note listeners stay mounted in every state.

A completed session shows a two-column **summary card**: _Session complete_, the length played, the assignment, tempo and time practised, _Again_, _Same shapes, new key_ and _Back to the stage_, and beside them every step with its time and _Notes for next time_, saved to that session's history record. There are no scores and no streaks.

## Feel-first wording

`coach/feel.ts` describes the assignment by how it sounds. It is presentation only: every phrase is read from the Score, so a custom progression or a new key is described just as truthfully, and `domain/describe.ts` still produces the theory sentence. The headline is a mood (one per mode, or the preset's hand-written feel while it is still in its own key and colour). The hands line says how busy the left hand is and what shape the right-hand tune makes. _Why it works_ tells where the chords travel, measured from home, and how the tune sits on them. `tests/coach-feel.spec.js` pins the wording and checks that no preset ever produces theory vocabulary.
