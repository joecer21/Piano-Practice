# Accessibility

Target: WCAG 2.2 AA. This page records what is verified automatically, what the Slice 14 pass found and fixed, and the manual screen-reader checklist that automation cannot replace.

## Automated checks

| Area                                                       | Where                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| axe (WCAG 2.0/2.1 A and AA) on landing and expanded tools  | `tests/browser/accessibility-audit.spec.js`, desktop and Pixel 7      |
| axe (to WCAG 2.2 AA) on expanded practice history          | `tests/browser/practice-history.spec.js`                              |
| axe on the update notice                                   | `tests/browser/pwa-lifecycle.spec.js`                                 |
| axe on the audition page                                   | `tests/browser/audition.spec.js`                                      |
| Live piano roving focus, arrow keys, Space/Enter           | `tests/browser/accessibility.spec.js`                                 |
| Computer-key shortcuts pause in form controls              | `tests/browser/accessibility.spec.js`                                 |
| Focus never hidden under the sticky header (2.4.11)        | `tests/browser/accessibility.spec.js`                                 |
| Focus behind the open bottom sheet scrolled clear (2.4.11) | `tests/browser/stage-layout.spec.js`                                  |
| Focus mode keeps practice controls; focus handed on        | `tests/browser/focus-session.spec.js`                                 |
| Modeless tool panel, Escape focus return, 320 px reflow    | `tests/browser/stage-layout.spec.js`                                  |
| Keyboard-only history annotate, delete, clear with focus   | `tests/browser/practice-history.spec.js`                              |
| 44 px minimum key width on phones                          | `tests/browser/accessibility.spec.js`                                 |
| Hand colour reserved for sounding notes (1.4.1)            | `tests/browser/coach.spec.js`                                         |
| Status, update and history messages are live regions       | component specs and the browser specs above                           |
| Reduced motion                                             | `styles/base.css`, `styles/components.css`; checked in the pass below |

## Slice 14 pass, 2026-09-13

Checked in Chromium at desktop width, Pixel 7, and 320 CSS px (equivalent to 400% zoom of a 1280 px window), with axe including the WCAG 2.2 rules, keyboard-only operation, and `prefers-reduced-motion: reduce`.

Found and fixed:

- **Focus obscured by the sticky header.** Shift-tabbing upward left 15 controls (Star, Share link, Change the assignment, Keyboard options…) underneath the sticky summary. The header's live height now sets `scroll-padding-top` (`coach/sticky-offset.ts`).
- **Deleting a practice record** happened immediately, without confirmation or announcement, and dropped focus to the page. It now asks first with focus on _Cancel_, returns focus to the trigger when cancelled, and moves focus to the _Recent practice_ heading with an announcement when confirmed. _Clear history_ does the same.
- **Save notes** gave no feedback; it now announces "Notes saved."
- **Audition page on phones** overflowed horizontally by 17 px, so mobile browsers zoomed the page out and the fixed navigation covered focused controls. The case selector now shrinks and the page reserves scroll padding for the bar.

Verified without change: no page-level horizontal scrolling at 320 px (the keyboard and the Score timeline scroll inside their own containers, as two-dimensional content; each contains a labelled group of focusable keys or bars, so it can be scrolled by keyboard); reduced motion removes transitions and animations and smooth scrolling; the update notice is a polite status region that never takes focus or reloads by itself; offline readiness and errors are announced through the one status line.

## Design upgrade pass, 2026-09-13

Found and fixed:

- **Focus obscured by the bottom sheet.** On phones the modeless tool sheet covers up to 70% of the viewport. Shift-tabbing through the Stage behind it left nine controls (Play, Loop, the key-label toggle, Full history…) underneath it. The sheet's live height now sets `scroll-padding-bottom` and matching page padding (`trackBottomSheetHeight` in `coach/sticky-offset.ts`).
- **Focus lost when the session changes state.** _Start_, _Finish_ and _End session_ disappear when pressed. When focus falls back to the page, it now moves to _Pause_, the summary heading or _Start_. Focus the player has put elsewhere, such as on a timeline bar, is never moved.

Focus mode hides chrome with `display: none`, so hidden controls leave the tab order and the accessibility tree together. The feel headline is the Stage's heading, followed by the hands line and the theory sentence. While practising, the step name is the heading, and the clock is a timer in the header. Recent practice expands in place, so focus returned after a delete or clear lands on its visible heading.

## Manual screen-reader checklist

Automation cannot judge whether announcements make sense. Run this at each stable release with **NVDA + Firefox or Chrome** on Windows and **VoiceOver + Safari** on iOS, and record the result in the release notes.

1. **Landing:** the heading, the feel headline and the assignment sentence are read; _Start 5 minutes_ is announced as unavailable, then available once the piano loads.
2. **Assignment editing:** open _Change the assignment_; every select, lock toggle and chord-palette button has a name and state; an invalid custom progression is explained; _Apply_ announces the result.
3. **Guided practice:** starting announces the step and the timer and lands focus on _Pause_; the hidden tools are not reachable while practising; _Pause_, _Next_, _End session_ are reachable; step changes are announced without flooding. Finishing lands on the summary heading, and _Save note_ announces the result.
4. **Playback status:** play and stop state is announced; a blocked-audio message is read.
5. **Live piano:** one tab stop; arrows move between named keys (for example "C sharp 4"); held state is not announced repeatedly.
6. **MIDI:** connect, device name, disconnect and the unsupported-browser message are read.
7. **Practice history:** the recommendation, records, notes fields, delete and clear confirmations, and export/import results are announced.
8. **Offline and update:** "Saved for offline use" on first visit; the update notice and its button after a deploy.
9. **Tool panel:** each rail button announces its expanded state; the panel remains modeless; _Close tools_ or Escape returns focus to the invoking rail button.
10. **Zoom and reflow:** at 200% and 400% browser zoom nothing is clipped; on iOS, text size at the largest accessibility setting does not hide controls.
