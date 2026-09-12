import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { PlayRequest, PlaybackSession } from "../audio/playback-engine.js";
import { describeAssignment, describeChordFunction } from "../domain/describe.js";
import type { CoachBridge } from "./bridge.js";
import { applyKeyboardOverlay, clearKeyboardOverlay } from "./keyboard-overlay.js";
import type { LabelMode } from "./keyboard-overlay.js";
import {
  DEFAULT_PRACTICE_CONTROLS,
  SESSION_SECONDS,
  buildPracticeRequest,
  clampFocusBar,
  formatClock,
  playheadFromTransport,
} from "./practice.js";
import type { Lens, PracticeControls } from "./practice.js";
import { pianoReadiness } from "./sampler.js";
import { Timeline } from "./Timeline.js";

type SessionState =
  { status: "idle" } | { status: "running" | "paused"; remainingMs: number } | { status: "complete" };

type CoachAppProps = {
  bridge: CoachBridge;
  /** Where the one-sentence summary and session controls render. */
  summaryContainer: HTMLElement | null;
};

const SESSION_MS = SESSION_SECONDS * 1000;
const TIMER_TICK_MS = 250;

const LENS_OPTIONS: ReadonlyArray<{ lens: Lens; label: string }> = [
  { lens: "both", label: "Both hands" },
  { lens: "lh", label: "Left hand" },
  { lens: "rh", label: "Right hand" },
];

export function CoachApp({ bridge, summaryContainer }: CoachAppProps) {
  const assignment = useSyncExternalStore(bridge.subscribeAssignment, bridge.getAssignment);
  const samplerSnapshot = useSyncExternalStore(bridge.subscribeSampler, bridge.getSamplerSnapshot);
  const readiness = useMemo(() => pianoReadiness(samplerSnapshot), [samplerSnapshot]);
  const score = assignment?.score ?? null;

  const [controls, setControls] = useState<PracticeControls>(DEFAULT_PRACTICE_CONTROLS);
  const [labelMode, setLabelMode] = useState<LabelMode>("degrees");
  const [playingRequest, setPlayingRequest] = useState<PlayRequest | null>(null);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [playheadBar, setPlayheadBar] = useState(0);
  const [session, setSession] = useState<SessionState>({ status: "idle" });

  const sessionRef = useRef<PlaybackSession | null>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const stopPlayback = useCallback(() => {
    const current = sessionRef.current;
    sessionRef.current = null;
    current?.stop();
    setPlayingRequest(null);
    setCountInBeat(null);
  }, []);

  const startPlayback = useCallback(
    async (nextControls: PracticeControls, options: { countIn: boolean }): Promise<boolean> => {
      if (!score || readiness.state !== "ready") return false;
      if (!(await bridge.unlockAudio())) return false;

      stopPlayback();
      bridge.stopOtherPlayback();
      const request = buildPracticeRequest(score, nextControls, {
        tempoBpm: bridge.getTempoBpm(),
        countIn: options.countIn,
      });
      try {
        sessionRef.current = bridge.audioEngine.play(request);
        setPlayingRequest(request);
        exposeForTests(request);
        return true;
      } catch (error) {
        sessionRef.current = null;
        setPlayingRequest(null);
        bridge.reportError(`Playback could not start: ${error instanceof Error ? error.message : error}`);
        return false;
      }
    },
    [bridge, readiness.state, score, stopPlayback],
  );

  // A session ending elsewhere (the legacy stop button, or reaching the end of a
  // non-looping pass) must be reflected here.
  useEffect(
    () =>
      bridge.audioEngine.on("status", (event) => {
        if (event.status !== "playing" && event.sessionId === sessionRef.current?.id) {
          sessionRef.current = null;
          setPlayingRequest(null);
          setCountInBeat(null);
        }
      }),
    [bridge],
  );

  // A new assignment replaces the music under the player: stop, and drop a bar
  // selection that no longer exists.
  const assignmentId = score?.sourceAssignmentId ?? null;
  useEffect(() => {
    stopPlayback();
    setPlayheadBar(0);
    setControls((previous) =>
      score ? { ...previous, focusBar: clampFocusBar(score, previous.focusBar) } : previous,
    );
    // Only the identity of the assignment matters here, not the score object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, stopPlayback]);

  // Stop whatever the coach started when it unmounts.
  useEffect(() => () => sessionRef.current?.stop(), []);

  // The playhead runs on requestAnimationFrame and writes straight to the DOM.
  // React state is touched only when the count-in beat or the bar changes.
  useEffect(() => {
    const playhead = playheadRef.current;
    if (!playingRequest) {
      if (playhead) playhead.hidden = true;
      return;
    }
    let frame = 0;
    let lastBar = -1;
    let lastCountIn = -1;
    const tick = () => {
      const position = playheadFromTransport(playingRequest, bridge.audioEngine.getSnapshot().positionBeats);
      if (position.phase === "countIn") {
        if (playhead) playhead.hidden = true;
        if (position.countInBeat !== lastCountIn) {
          lastCountIn = position.countInBeat;
          setCountInBeat(position.countInBeat);
        }
      } else {
        if (lastCountIn !== -1) {
          lastCountIn = -1;
          setCountInBeat(null);
        }
        if (playhead) {
          playhead.hidden = false;
          playhead.style.left = `${(position.sourceBeat / playingRequest.score.meta.totalBeats) * 100}%`;
        }
        if (position.barIndex !== lastBar) {
          lastBar = position.barIndex;
          setPlayheadBar(position.barIndex);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bridge, playingRequest]);

  // The keyboard teaches the bar in front of the player: the selected bar if
  // there is one, otherwise the bar under the playhead.
  const overlayBar = controls.focusBar ?? playheadBar;
  useEffect(() => {
    const keyboard = bridge.getKeyboardElement();
    if (!keyboard || !score) return;
    applyKeyboardOverlay(keyboard, { score, barIndex: overlayBar, lens: controls.lens, labelMode });
  }, [bridge, score, overlayBar, controls.lens, labelMode]);

  useEffect(
    () => () => {
      const keyboard = bridge.getKeyboardElement();
      if (keyboard) clearKeyboardOverlay(keyboard);
    },
    [bridge],
  );

  const updateControls = useCallback(
    (patch: Partial<PracticeControls>) => {
      const next = { ...controls, ...patch };
      setControls(next);
      // Changing what is being practised restarts playback immediately, without
      // a second count-in, so the change is heard at once.
      if (playingRequest) void startPlayback(next, { countIn: false });
    },
    [controls, playingRequest, startPlayback],
  );

  // Session countdown. Timing is measured from wall-clock deltas, so a throttled
  // background tab does not stretch five minutes into seven.
  useEffect(() => {
    if (session.status !== "running") return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      setSession((current) => {
        if (current.status !== "running") return current;
        const remainingMs = current.remainingMs - elapsed;
        return remainingMs > 0 ? { status: "running", remainingMs } : { status: "complete" };
      });
    }, TIMER_TICK_MS);
    return () => clearInterval(timer);
  }, [session.status]);

  useEffect(() => {
    if (session.status === "complete") stopPlayback();
  }, [session.status, stopPlayback]);

  const startSession = useCallback(async () => {
    if (await startPlayback(controls, { countIn: true })) {
      setSession({ status: "running", remainingMs: SESSION_MS });
    }
  }, [controls, startPlayback]);

  const pauseSession = useCallback(() => {
    stopPlayback();
    setSession((current) => (current.status === "running" ? { ...current, status: "paused" } : current));
  }, [stopPlayback]);

  const resumeSession = useCallback(async () => {
    if (session.status !== "paused") return;
    if (await startPlayback(controls, { countIn: true })) {
      setSession({ status: "running", remainingMs: session.remainingMs });
    }
  }, [controls, session, startPlayback]);

  const endSession = useCallback(() => {
    stopPlayback();
    setSession({ status: "idle" });
  }, [stopPlayback]);

  const togglePlayback = useCallback(() => {
    if (playingRequest) stopPlayback();
    else void startPlayback(controls, { countIn: true });
  }, [controls, playingRequest, startPlayback, stopPlayback]);

  const sentence = score
    ? describeAssignment(score, { leftHand: assignment?.leftHand, motif: assignment?.motif })
    : "Preparing your first assignment…";
  const ready = readiness.state === "ready" && !!score;
  const readinessNote =
    readiness.state === "loading"
      ? `Loading ${readiness.label}${readiness.percent == null ? "…" : ` ${readiness.percent}%`}`
      : readiness.state === "error"
        ? readiness.message
        : null;
  const focusedBar = score && controls.focusBar != null ? score.bars[controls.focusBar] : null;

  const summary = (
    <div className="coach-summary-body">
      <p className="coach-sentence" data-testid="coach-sentence">
        {sentence}
      </p>
      <div className="coach-session" aria-label="Practice session">
        {session.status === "idle" ? (
          <button type="button" className="coach-start" disabled={!ready} onClick={() => void startSession()}>
            Start 5 minutes
          </button>
        ) : null}
        {session.status === "running" || session.status === "paused" ? (
          <>
            <span className="coach-clock" role="timer" aria-label="Time left in session">
              {formatClock(session.remainingMs / 1000)}
            </span>
            {session.status === "running" ? (
              <button type="button" className="coach-secondary" onClick={pauseSession}>
                Pause
              </button>
            ) : (
              <button type="button" className="coach-start" onClick={() => void resumeSession()}>
                Resume
              </button>
            )}
            <button type="button" className="coach-secondary" onClick={endSession}>
              End
            </button>
          </>
        ) : null}
        {session.status === "complete" ? (
          <>
            <span className="coach-complete">Five minutes done.</span>
            <button
              type="button"
              className="coach-start"
              disabled={!ready}
              onClick={() => void startSession()}
            >
              Start again
            </button>
          </>
        ) : null}
        {readinessNote ? (
          <span className="coach-readiness" role="status">
            {readinessNote}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {summaryContainer ? createPortal(summary, summaryContainer) : summary}

      <section className="coach-practice-panel" aria-label="Practice controls">
        <div className="coach-transport">
          <button
            type="button"
            className="coach-play"
            disabled={!ready}
            aria-pressed={!!playingRequest}
            onClick={togglePlayback}
          >
            {playingRequest ? "Stop" : "Play"}
          </button>
          <span className="coach-count-in" aria-hidden="true">
            {countInBeat != null ? `Count-in ${countInBeat}` : ""}
          </span>

          <div className="coach-segmented" role="group" aria-label="Hands">
            {LENS_OPTIONS.map((option) => (
              <button
                key={option.lens}
                type="button"
                aria-pressed={controls.lens === option.lens}
                onClick={() => updateControls({ lens: option.lens })}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="coach-toggle"
            aria-pressed={controls.slow}
            onClick={() => updateControls({ slow: !controls.slow })}
          >
            Half speed
          </button>
          <button
            type="button"
            className="coach-toggle"
            aria-pressed={controls.loop}
            onClick={() => updateControls({ loop: !controls.loop })}
          >
            Loop
          </button>

          <div className="coach-segmented" role="group" aria-label="Key labels">
            <button
              type="button"
              aria-pressed={labelMode === "degrees"}
              onClick={() => setLabelMode("degrees")}
            >
              Degrees
            </button>
            <button
              type="button"
              aria-pressed={labelMode === "letters"}
              onClick={() => setLabelMode("letters")}
            >
              Letters
            </button>
          </div>
        </div>

        <p className="coach-focus" aria-live="polite">
          {focusedBar ? (
            <>
              <span>
                Bar {focusedBar.barIndex + 1} · {describeChordFunction(focusedBar)}
              </span>{" "}
              <button type="button" className="coach-link" onClick={() => updateControls({ focusBar: null })}>
                Practice the whole piece
              </button>
            </>
          ) : (
            "Select a bar to practice it on its own."
          )}
        </p>

        {score ? (
          <Timeline
            score={score}
            lens={controls.lens}
            focusBar={controls.focusBar}
            onSelectBar={(focusBar) => updateControls({ focusBar })}
            playheadRef={playheadRef}
          />
        ) : null}

        <button type="button" className="coach-link coach-change" onClick={bridge.openAssignmentDrawer}>
          Change the assignment
        </button>
      </section>
    </>
  );
}

declare global {
  interface Window {
    __coachPlayback?: Pick<PlayRequest, "parts" | "barRange" | "rate" | "loop" | "countIn">;
  }
}

/** Observable hook for browser tests, in the same spirit as window.__transportState. */
function exposeForTests(request: PlayRequest): void {
  if (typeof window === "undefined") return;
  window.__coachPlayback = {
    parts: request.parts,
    barRange: request.barRange,
    rate: request.rate,
    loop: request.loop,
    countIn: request.countIn,
  };
}
