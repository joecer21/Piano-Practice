import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ActiveSession, SessionLength, SessionState } from "./session.js";
import { SESSION_LENGTHS, remainingMs, startLabel, stepProgress } from "./session.js";
import { formatClock } from "./practice.js";

type SessionHeaderProps = {
  /** How the assignment feels, shown large above the theory sentence. */
  feel?: string | null;
  sentence: string;
  readinessNote: string | null;
  ready: boolean;
  session: SessionState;
  length: SessionLength;
  onLengthChange: (length: SessionLength) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onEnd: () => void;
  onAgainNewKey: () => void;
  /** Leave the summary and return to the Stage. */
  onDone?: () => void;
  /** Saves a note on the record the finished session wrote; absent when nothing was recorded. */
  onSaveNote?: (notes: string) => void;
};

/**
 * Top of the workspace: what you are playing, in one sentence, and where you are
 * in the session. One primary button on arrival; the focus controls appear only
 * while a session runs, and a calm summary card when it ends.
 */
export function SessionHeader(props: SessionHeaderProps) {
  const { feel, sentence, readinessNote, session } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusHandoff(rootRef, session.status);

  return (
    <div className="coach-summary-body" ref={rootRef}>
      {feel ? (
        <p className="coach-feel" data-testid="coach-feel">
          {feel}
        </p>
      ) : null}
      <p className="coach-sentence" data-testid="coach-sentence">
        {sentence}
      </p>
      {session.status === "idle" ? <IdleControls {...props} /> : null}
      {session.status === "running" || session.status === "paused" ? (
        <ActiveControls {...props} session={session} />
      ) : null}
      {session.status === "complete" ? <Summary {...props} /> : null}
      {readinessNote ? (
        <p className="coach-readiness" role="status">
          {readinessNote}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The control a keyboard user just pressed (Start, Finish, End session) vanishes
 * when the session changes state. If focus fell back to the page, hand it to the
 * control that now carries the flow; never move focus the player put elsewhere.
 */
function useFocusHandoff(rootRef: RefObject<HTMLDivElement | null>, status: SessionState["status"]) {
  const previous = useRef(status);
  useEffect(() => {
    const from = previous.current;
    previous.current = status;
    const root = rootRef.current;
    if (!root || from === status) return;
    const doc = root.ownerDocument;
    const active = doc.activeElement;
    if (active && active !== doc.body && active.isConnected) return;
    const target =
      status === "complete"
        ? "#coach-summary-title"
        : status === "idle"
          ? ".coach-start"
          : ".coach-session-controls button";
    root.querySelector<HTMLElement>(target)?.focus();
  }, [rootRef, status]);
}

function IdleControls({ ready, length, onLengthChange, onStart }: SessionHeaderProps) {
  return (
    <div className="coach-session">
      <button type="button" className="coach-start" disabled={!ready} onClick={onStart}>
        {startLabel(length)}
      </button>
      <label className="coach-length">
        <span className="coach-visually-hidden">Session length</span>
        <select
          value={String(length)}
          onChange={(event) =>
            onLengthChange(
              event.target.value === "untimed" ? "untimed" : (Number(event.target.value) as SessionLength),
            )
          }
        >
          {SESSION_LENGTHS.map((option) => (
            <option key={String(option.length)} value={String(option.length)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ActiveControls(props: SessionHeaderProps & { session: ActiveSession }) {
  const { session, onPause, onResume, onNext, onPrevious, onEnd } = props;
  const step = session.steps[session.stepIndex];
  const remaining = remainingMs(session);
  const isLast = session.stepIndex === session.steps.length - 1;
  const paused = session.status === "paused";

  return (
    <div className="coach-focus-bar" data-paused={paused || undefined}>
      <p className="coach-clock-wrap">
        <span
          className="coach-clock"
          role="timer"
          aria-label={remaining == null ? "Time practised" : "Time left in session"}
        >
          {formatClock((remaining ?? session.elapsedMs) / 1000)}
        </span>
        <span className="coach-clock-note">
          {paused ? "Paused" : remaining == null ? "practised" : "left"}
        </span>
      </p>

      <ol className="coach-steps" aria-label="Session steps">
        {session.steps.map((candidate, index) => {
          const state =
            index < session.stepIndex ? "done" : index === session.stepIndex ? "current" : "upcoming";
          const fill = state === "done" ? 1 : state === "current" ? stepProgress(session) : 0;
          return (
            <li
              key={candidate.id}
              className="coach-step"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="coach-step-bar" aria-hidden="true">
                <span className="coach-step-fill" style={{ transform: `scaleX(${fill})` }} />
              </span>
              <span className="coach-step-title">{candidate.title}</span>
            </li>
          );
        })}
      </ol>

      <p className="coach-instruction" aria-live="polite">
        <strong>{step.title}.</strong> {step.instruction}
        {session.advanceDue ? <span className="coach-due"> Moving on at the next bar…</span> : null}
      </p>

      <div className="coach-session coach-session-controls">
        {paused ? (
          <button type="button" className="coach-start" onClick={onResume}>
            Resume
          </button>
        ) : (
          <button type="button" className="coach-secondary" onClick={onPause}>
            Pause
          </button>
        )}
        <button
          type="button"
          className="coach-secondary"
          onClick={onPrevious}
          disabled={session.stepIndex === 0}
        >
          Previous step
        </button>
        <button type="button" className="coach-secondary" onClick={onNext}>
          {isLast ? "Finish" : "Next step"}
        </button>
        <button type="button" className="coach-link" onClick={onEnd}>
          End session
        </button>
      </div>
    </div>
  );
}

function Summary({ session, ready, onStart, onAgainNewKey, onDone, onSaveNote }: SessionHeaderProps) {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  if (session.status !== "complete") return null;
  // The length the session actually ran at, not whatever the selector shows now.
  const title = session.length === "untimed" ? "Session done." : `${session.length / 60} minutes done.`;
  const covered = session.steps.filter((step) => (session.timeByStep[step.id] ?? 0) >= 1000);
  return (
    <section className="coach-summary-done" aria-labelledby="coach-summary-title">
      <h2 id="coach-summary-title" className="coach-summary-title" tabIndex={-1}>
        {title}
      </h2>
      <p className="coach-complete">You practised for {formatClock(session.elapsedMs / 1000)}.</p>
      {covered.length ? (
        <ul className="coach-covered" aria-label="What you covered">
          {covered.map((step) => (
            <li key={step.id}>
              {step.title}{" "}
              <span className="coach-covered-time">
                {formatClock((session.timeByStep[step.id] ?? 0) / 1000)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {onSaveNote ? (
        <form
          className="coach-summary-note"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveNote(note);
            setSaved("Note saved to Recent practice.");
          }}
        >
          <label htmlFor="coach-summary-note">A note for next time</label>
          <textarea
            id="coach-summary-note"
            maxLength={2000}
            rows={2}
            value={note}
            placeholder="What felt good, and what to come back to"
            onChange={(event) => {
              setNote(event.target.value);
              setSaved("");
            }}
          />
          <div className="coach-session">
            <button type="submit" className="coach-secondary">
              Save note
            </button>
            <span className="coach-library-status" role="status">
              {saved}
            </span>
          </div>
        </form>
      ) : null}

      <div className="coach-session">
        <button type="button" className="coach-start" disabled={!ready} onClick={onStart}>
          Again, same assignment
        </button>
        <button type="button" className="coach-secondary" disabled={!ready} onClick={onAgainNewKey}>
          Again in a new key
        </button>
        {onDone ? (
          <button type="button" className="coach-link" onClick={onDone}>
            Done
          </button>
        ) : null}
      </div>
    </section>
  );
}
