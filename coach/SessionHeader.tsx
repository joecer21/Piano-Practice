import type { ActiveSession, SessionLength, SessionState } from "./session.js";
import { SESSION_LENGTHS, remainingMs, startLabel, stepProgress } from "./session.js";
import { formatClock } from "./practice.js";

type SessionHeaderProps = {
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
};

/**
 * Top of the workspace: what you are playing, in one sentence, and where you are
 * in the session. One primary button on arrival; everything else appears only
 * once a session is running.
 */
export function SessionHeader(props: SessionHeaderProps) {
  const { sentence, readinessNote, session } = props;
  return (
    <div className="coach-summary-body">
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

  return (
    <>
      <div className="coach-session">
        <span
          className="coach-clock"
          role="timer"
          aria-label={remaining == null ? "Time practised" : "Time left in session"}
        >
          {formatClock((remaining ?? session.elapsedMs) / 1000)}
        </span>
        {session.status === "running" ? (
          <button type="button" className="coach-secondary" onClick={onPause}>
            Pause
          </button>
        ) : (
          <button type="button" className="coach-start" onClick={onResume}>
            Resume
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
    </>
  );
}

function Summary({ session, ready, onStart, onAgainNewKey }: SessionHeaderProps) {
  if (session.status !== "complete") return null;
  // The length the session actually ran at, not whatever the selector shows now.
  const title = session.length === "untimed" ? "Session done." : `${session.length / 60} minutes done.`;
  return (
    <div className="coach-summary-done">
      <p className="coach-complete">
        <strong>{title}</strong> You practised for {formatClock(session.elapsedMs / 1000)}.
      </p>
      <ul className="coach-covered" aria-label="What you covered">
        {session.steps
          .filter((step) => (session.timeByStep[step.id] ?? 0) >= 1000)
          .map((step) => (
            <li key={step.id}>
              {step.title}{" "}
              <span className="coach-covered-time">
                {formatClock((session.timeByStep[step.id] ?? 0) / 1000)}
              </span>
            </li>
          ))}
      </ul>
      <div className="coach-session">
        <button type="button" className="coach-start" disabled={!ready} onClick={onStart}>
          Again, same assignment
        </button>
        <button type="button" className="coach-secondary" disabled={!ready} onClick={onAgainNewKey}>
          Again in a new key
        </button>
      </div>
    </div>
  );
}
