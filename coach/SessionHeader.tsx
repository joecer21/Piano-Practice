import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { Feel } from "./feel.js";
import { Icon } from "./Icon.js";
import type { ActiveSession, SessionLength, SessionState, SessionStepId } from "./session.js";
import { SESSION_LENGTHS, remainingMs, startLabel } from "./session.js";
import { formatClock } from "./practice.js";

type SessionHeaderProps = {
  /** How the assignment feels: the Stage headline, the hands and "why it works". */
  feel?: Feel | null;
  /** The theory sentence, kept visible as the "in theory" line. */
  sentence: string;
  /** "Today · First Pop Improv in C". */
  eyebrow?: string;
  /** "First Pop Improv in C", for the summary card. */
  assignmentLabel?: string | null;
  tempoBpm?: number;
  /** Per step of a finished session: "looped bar 3 · half speed". */
  stepDetails?: Partial<Record<SessionStepId, string>>;
  readinessNote: string | null;
  ready: boolean;
  hasMotif?: boolean;
  session: SessionState;
  length: SessionLength;
  onLengthChange: (length: SessionLength) => void;
  onStart: () => void;
  onNext: () => void;
  onEnd: () => void;
  onAgainNewKey: () => void;
  /** Leave the summary and return to the Stage. */
  onDone?: () => void;
  /** Saves notes on the record the finished session wrote; absent when nothing was recorded. */
  onSaveNote?: (notes: string) => void;
  /** Header slot where the clock, Next step and End session replace the tools while practising. */
  focusbarContainer?: HTMLElement | null;
};

const SESSION_LENGTH_LABELS: Record<string, string> = {
  "120": "2 min",
  "300": "5 min",
  "600": "10 min",
  untimed: "Untimed",
};

const LENGTH_WORDS: Record<number, string> = { 2: "Two", 5: "Five", 10: "Ten" };

/**
 * The top of the Stage. Idle: the brief (how it feels, the theory line and the
 * start block). Practising: the step rail, the step and its instruction, with the
 * clock in the header. Complete: a calm summary card. CSS on data-session-status
 * decides what shows; the brief stays mounted throughout.
 */
export function SessionHeader(props: SessionHeaderProps) {
  const { session, focusbarContainer } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusHandoff(rootRef, session.status);
  const active = session.status === "running" || session.status === "paused" ? session : null;
  const focusbar = active ? <FocusBar {...props} session={active} /> : null;

  return (
    <div className="coach-summary-body" ref={rootRef}>
      <Brief {...props} />
      {active ? <FocusHead session={active} /> : null}
      {focusbar ? (focusbarContainer ? createPortal(focusbar, focusbarContainer) : focusbar) : null}
      {session.status === "complete" ? <Summary {...props} /> : null}
    </div>
  );
}

/**
 * The control a keyboard user just pressed (Start, Finish, End session) vanishes
 * or is hidden when the session changes state. If focus fell back to the page,
 * hand it to the control that now carries the flow; never move focus the player
 * put somewhere that is still visible.
 */
function useFocusHandoff(rootRef: RefObject<HTMLDivElement | null>, status: SessionState["status"]) {
  const previous = useRef(status);
  useEffect(() => {
    const from = previous.current;
    previous.current = status;
    const root = rootRef.current;
    if (!root || from === status) return;
    const doc = root.ownerDocument;
    // After the shell's data-session-status (set by the parent) has hidden what it hides.
    const frame = requestAnimationFrame(() => {
      const current = doc.activeElement;
      const lost =
        !current || current === doc.body || !current.isConnected || !current.getClientRects().length;
      if (!lost) return;
      const target =
        status === "complete" ? "#coach-summary-title" : status === "idle" ? ".coach-start" : ".coach-play";
      doc.querySelector<HTMLElement>(target)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [rootRef, status]);
}

function Brief({
  feel,
  sentence,
  eyebrow,
  readinessNote,
  ready,
  hasMotif = true,
  length,
  onLengthChange,
  onStart,
}: SessionHeaderProps) {
  const hands = feel ? [feel.lh, feel.rh].filter(Boolean).join(" ") : "";
  return (
    <section className="coach-brief" aria-labelledby={feel ? "coach-feel" : undefined}>
      <div className="coach-brief-text">
        {eyebrow ? <p className="coach-eyebrow">{eyebrow}</p> : null}
        {feel ? (
          <h2 id="coach-feel" className="coach-feel" data-testid="coach-feel">
            {feel.headline}
          </h2>
        ) : null}
        {hands ? <p className="coach-feel-sub">{hands}</p> : null}
        <div className="coach-theory">
          <p>
            <span className="coach-theory-tag">In theory</span>{" "}
            <span className="coach-sentence" data-testid="coach-sentence">
              {sentence}
            </span>
          </p>
          {feel ? (
            <details className="coach-why">
              <summary>Why it works</summary>
              <p>{feel.why}</p>
            </details>
          ) : null}
        </div>
      </div>

      <div className="coach-start-block">
        <button type="button" className="coach-start coach-big" disabled={!ready} onClick={onStart}>
          <Icon name="play" />
          {startLabel(length)}
        </button>
        <div className="coach-segmented" role="group" aria-label="Session length">
          {SESSION_LENGTHS.map((option) => (
            <button
              key={String(option.length)}
              type="button"
              aria-pressed={option.length === length}
              aria-label={option.label}
              onClick={() => onLengthChange(option.length)}
            >
              {SESSION_LENGTH_LABELS[String(option.length)]}
            </button>
          ))}
        </div>
        <p className="coach-hint">
          {hasMotif
            ? "Six short steps: the whole thing, each hand, the chords, the tune, then your turn."
            : "Five short steps: the whole thing, each hand, the chords, then your turn."}
        </p>
        {readinessNote ? (
          <p className="coach-readiness" role="status">
            {readinessNote}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FocusHead({ session }: { session: ActiveSession }) {
  const step = session.steps[session.stepIndex];
  const planned = session.stepDurationsMs?.[session.stepIndex];
  const position = `${session.stepIndex + 1} of ${session.steps.length}`;
  return (
    <section className="coach-focus-head" aria-labelledby="coach-step-title">
      <ol className="coach-steps" aria-label="Session steps">
        {session.steps.map((candidate, index) => {
          const state =
            index < session.stepIndex ? "done" : index === session.stepIndex ? "current" : "upcoming";
          const duration = session.stepDurationsMs?.[index];
          const fill =
            state === "done"
              ? 1
              : state === "current" && duration
                ? Math.min(1, session.stepElapsedMs / duration)
                : 0;
          return (
            <li
              key={candidate.id}
              className="coach-step"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              style={{ flexGrow: candidate.weight }}
            >
              <span className="coach-step-bar" aria-hidden="true">
                <span className="coach-step-fill" style={{ transform: `scaleX(${fill})` }} />
              </span>
              <span className="coach-step-title">{candidate.title}</span>
            </li>
          );
        })}
      </ol>
      <div className="coach-step-row">
        <h2 id="coach-step-title" className="coach-step-heading">
          {step.title}
        </h2>
        <span className="coach-step-left">
          {planned
            ? `${formatClock(Math.max(0, planned - session.stepElapsedMs) / 1000)} left in this step · ${position}`
            : `Step ${position}`}
        </span>
      </div>
      <p className="coach-instruction" aria-live="polite">
        {step.instruction}
        {session.advanceDue ? <span className="coach-due"> Moving on at the next bar…</span> : null}
      </p>
    </section>
  );
}

function FocusBar({ session, onNext, onEnd }: SessionHeaderProps & { session: ActiveSession }) {
  const remaining = remainingMs(session);
  const total = session.stepDurationsMs?.reduce((sum, duration) => sum + duration, 0) ?? 0;
  const isLast = session.stepIndex === session.steps.length - 1;
  return (
    <div className="coach-focusbar-body" data-paused={session.status === "paused" || undefined}>
      <p className="coach-clock-wrap">
        <span
          className="coach-clock"
          role="timer"
          aria-label={remaining == null ? "Time practised" : "Time left in session"}
        >
          {formatClock((remaining ?? session.elapsedMs) / 1000)}
        </span>
        <span className="coach-clock-note">
          {session.status === "paused"
            ? "Paused"
            : remaining == null
              ? "practised"
              : `left of ${formatClock(total / 1000)}`}
        </span>
      </p>
      <div className="coach-session coach-session-controls">
        <button type="button" className="coach-secondary" onClick={onNext}>
          <Icon name="next" />
          {isLast ? "Finish" : "Next step"}
        </button>
        <button type="button" className="coach-link" onClick={onEnd}>
          End session
        </button>
      </div>
    </div>
  );
}

function Summary({
  session,
  ready,
  assignmentLabel,
  tempoBpm,
  stepDetails = {},
  onStart,
  onAgainNewKey,
  onDone,
  onSaveNote,
}: SessionHeaderProps) {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  if (session.status !== "complete") return null;
  const covered = session.steps.filter((step) => (session.timeByStep[step.id] ?? 0) >= 1000);
  // The length the session actually ran at, not whatever the selector shows now.
  const length = session.length === "untimed" ? "Session" : `${LENGTH_WORDS[session.length / 60]} minutes`;
  const title =
    covered.length === session.steps.length ? `${length}, played all the way through.` : `${length}, done.`;
  const meta = [
    assignmentLabel,
    tempoBpm ? `${tempoBpm} bpm` : null,
    `${formatClock(session.elapsedMs / 1000)} practised`,
  ].filter(Boolean);

  return (
    <section className="coach-summary-done" aria-labelledby="coach-summary-title">
      <div className="coach-summary-lead">
        <p className="coach-eyebrow">Session complete</p>
        <h2 id="coach-summary-title" className="coach-summary-title" tabIndex={-1}>
          {title}
        </h2>
        <p className="coach-summary-meta">{meta.join(" · ")}</p>
        <div className="coach-session">
          <button type="button" className="coach-start coach-big" disabled={!ready} onClick={onStart}>
            Again
          </button>
          <button
            type="button"
            className="coach-secondary coach-big"
            disabled={!ready}
            onClick={onAgainNewKey}
          >
            Same shapes, new key
          </button>
          {onDone ? (
            <button type="button" className="coach-link" onClick={onDone}>
              Back to the stage
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <ol className="coach-covered" aria-label="What you covered">
          {covered.map((step) => (
            <li key={step.id}>
              <span>
                {step.title}
                {stepDetails[step.id] ? ` · ${stepDetails[step.id]}` : ""}
              </span>
              <span className="coach-covered-time">
                {formatClock((session.timeByStep[step.id] ?? 0) / 1000)}
              </span>
            </li>
          ))}
        </ol>
        {onSaveNote ? (
          <form
            className="coach-summary-note"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveNote(note);
              setSaved("Notes saved to Recent practice.");
            }}
          >
            <label htmlFor="coach-summary-note">Notes for next time</label>
            <textarea
              id="coach-summary-note"
              maxLength={2000}
              rows={3}
              value={note}
              placeholder="What felt good, and what to come back to"
              onChange={(event) => {
                setNote(event.target.value);
                setSaved("");
              }}
            />
            <div className="coach-session">
              <button type="submit" className="coach-secondary">
                Save notes
              </button>
              <span className="coach-library-status" role="status">
                {saved}
              </span>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
