import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { PlayRequest, PlaybackSession } from "../audio/playback-engine.js";
import { describeAssignment } from "../domain/describe.js";
import { EMPTY_HELD_NOTES, playedNotes, reduceHeldNotes } from "../input/held-notes.js";
import { AssignmentWorkspace } from "./AssignmentWorkspace.js";
import type { CoachBridge } from "./bridge.js";
import { applyKeyboardOverlay, clearKeyboardOverlay } from "./keyboard-overlay.js";
import type { LabelMode } from "./keyboard-overlay.js";
import { LibraryControls } from "./LibraryControls.js";
import { PracticeHistory } from "./PracticeHistory.js";
import type { HistoryAction } from "./PracticeHistory.js";
import type { LearningLens, PracticeRecord } from "../application/practice-record.js";
import { MidiControl } from "./MidiControl.js";
import { applyPlayedKeys } from "./played-keys.js";
import type { OffKeyboard } from "./played-keys.js";
import {
  DEFAULT_PRACTICE_CONTROLS,
  buildPracticeRequest,
  clampFocusBar,
  playheadFromTransport,
} from "./practice.js";
import type { PracticeControls } from "./practice.js";
import { PracticePanel } from "./PracticePanel.js";
import { pianoReadiness } from "./sampler.js";
import { ScaleReference } from "./ScaleReference.js";
import { StatusLine } from "./StatusLine.js";
import { SessionHeader } from "./SessionHeader.js";
import { SoundSettings } from "./SoundSettings.js";
import {
  DEFAULT_SESSION_LENGTH,
  IDLE_SESSION,
  crossedBarBoundary,
  sessionReducer,
  sessionSteps,
  visibleTimerDelta,
} from "./session.js";
import type { SessionLength, SessionStep } from "./session.js";
import {
  activeMotifNoteIndex,
  chordShapeMidis,
  controlsForView,
  hasMotif,
  motifCycleNotes,
  stepChord,
} from "./views.js";
import type { BreakdownView } from "./views.js";

type CoachAppProps = {
  bridge: CoachBridge;
  /** Where the one-sentence summary and session controls render. */
  summaryContainer: HTMLElement | null;
  /** Where the MIDI keyboard control renders, beside the keyboard. */
  inputContainer?: HTMLElement | null;
  /** Static slot that keeps settings below the status line and above reference tools. */
  settingsContainer?: HTMLElement | null;
};

const TIMER_TICK_MS = 250;

export function CoachApp({
  bridge,
  summaryContainer,
  inputContainer = null,
  settingsContainer = null,
}: CoachAppProps) {
  const assignment = useSyncExternalStore(bridge.subscribeAssignment, bridge.getAssignment);
  const samplerSnapshot = useSyncExternalStore(bridge.subscribeSampler, bridge.getSamplerSnapshot);
  const readiness = useMemo(() => pianoReadiness(samplerSnapshot), [samplerSnapshot]);
  const score = assignment?.score ?? null;

  const [view, setView] = useState<BreakdownView>("whole");
  const [controls, setControls] = useState<PracticeControls>(DEFAULT_PRACTICE_CONTROLS);
  const [labelMode, setLabelModeState] = useState<LabelMode>(() => bridge.library.preferences().labelMode);
  const [playingRequest, setPlayingRequest] = useState<PlayRequest | null>(null);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [playheadBar, setPlayheadBar] = useState(0);
  const [activeMotifIndex, setActiveMotifIndex] = useState(-1);
  const [offKeyboard, setOffKeyboard] = useState<OffKeyboard>({ below: 0, above: 0 });
  const [sessionLength, setSessionLengthState] = useState<SessionLength>(
    () => bridge.library.preferences().sessionLength ?? DEFAULT_SESSION_LENGTH,
  );
  const [session, dispatch] = useReducer(sessionReducer, IDLE_SESSION);

  // Degrees or letters, and the session length, are remembered between visits.
  const setLabelMode = useCallback(
    (mode: LabelMode) => {
      setLabelModeState(mode);
      bridge.library.setPreference("labelMode", mode);
    },
    [bridge],
  );
  const setSessionLength = useCallback(
    (length: SessionLength) => {
      setSessionLengthState(length);
      bridge.library.setPreference("sessionLength", length);
    },
    [bridge],
  );

  const sessionRef = useRef<PlaybackSession | null>(null);
  const playbackAttemptRef = useRef(0);
  const wantsPlaybackRef = useRef(false);
  const playheadRef = useRef<HTMLDivElement>(null);
  const assignmentWorkspaceRef = useRef<HTMLDetailsElement>(null);
  const activePracticeRef = useRef<{ id: string; baseDurationMs: number } | null>(null);
  const practisedHandsRef = useRef(new Set<"left" | "right">());
  const visitedBarsRef = useRef(new Set<number>());
  const usedLensesRef = useRef(new Set<LearningLens>());
  const lastPracticeWriteRef = useRef("");
  const viewRef = useRef(view);
  viewRef.current = view;

  // ---- Playback ------------------------------------------------------------

  const stopPlayback = useCallback(() => {
    wantsPlaybackRef.current = false;
    playbackAttemptRef.current += 1;
    const current = sessionRef.current;
    sessionRef.current = null;
    current?.stop();
    setPlayingRequest(null);
    setCountInBeat(null);
  }, []);

  const startPlayback = useCallback(
    async (nextControls: PracticeControls, options: { countIn: boolean }): Promise<boolean> => {
      if (!score || readiness.state !== "ready") return false;
      wantsPlaybackRef.current = true;
      const attempt = ++playbackAttemptRef.current;
      if (!(await bridge.unlockAudio())) {
        if (attempt === playbackAttemptRef.current) wantsPlaybackRef.current = false;
        return false;
      }
      // A newer control change may have started its own request while audio was
      // unlocking. Let that request own playback instead of reviving stale music.
      if (attempt !== playbackAttemptRef.current) return wantsPlaybackRef.current;
      if (!wantsPlaybackRef.current) return false;

      const current = sessionRef.current;
      sessionRef.current = null;
      current?.stop();
      setPlayingRequest(null);
      setCountInBeat(null);
      bridge.stopOtherPlayback();
      const request = buildPracticeRequest(score, nextControls, {
        tempoBpm: bridge.getTempoBpm(),
        countIn: options.countIn,
      });
      try {
        sessionRef.current = bridge.audioEngine.play(request);
        setPlayingRequest(request);
        bridge.observePlayback(request);
        return true;
      } catch (error) {
        if (attempt === playbackAttemptRef.current) wantsPlaybackRef.current = false;
        sessionRef.current = null;
        setPlayingRequest(null);
        bridge.reportError(`Playback could not start: ${error instanceof Error ? error.message : error}`);
        return false;
      }
    },
    [bridge, readiness.state, score],
  );

  // A session ending elsewhere (a host stop command, or reaching the end of a
  // non-looping pass) must be reflected here.
  useEffect(
    () =>
      bridge.audioEngine.on("status", (event) => {
        if (event.status !== "playing" && event.sessionId === sessionRef.current?.id) {
          wantsPlaybackRef.current = false;
          playbackAttemptRef.current += 1;
          sessionRef.current = null;
          setPlayingRequest(null);
          setCountInBeat(null);
        }
      }),
    [bridge],
  );

  // Stop whatever the coach started when it unmounts.
  useEffect(() => () => sessionRef.current?.stop(), []);

  // Apply new practice controls; if music is playing, restart at once without a
  // second count-in so the change is heard immediately.
  const applyControls = useCallback(
    (next: PracticeControls) => {
      setControls(next);
      if (playingRequest || wantsPlaybackRef.current) void startPlayback(next, { countIn: false });
    },
    [playingRequest, startPlayback],
  );

  const updateControls = useCallback(
    (patch: Partial<PracticeControls>) => applyControls({ ...controls, ...patch }),
    [applyControls, controls],
  );

  const selectView = useCallback(
    (nextView: BreakdownView) => {
      if (!score) return;
      setView(nextView);
      applyControls(controlsForView(nextView, controls, score));
    },
    [applyControls, controls, score],
  );

  const togglePlayback = useCallback(() => {
    if (playingRequest) stopPlayback();
    else void startPlayback(controls, { countIn: true });
  }, [controls, playingRequest, startPlayback, stopPlayback]);

  // A new assignment replaces the music under the player: stop, and drop a bar
  // selection that no longer exists. "Again in a new key" starts a session once
  // the new assignment has arrived.
  const pendingSessionStart = useRef(false);
  const assignmentId = score?.sourceAssignmentId ?? null;
  useEffect(() => {
    stopPlayback();
    setPlayheadBar(0);
    setActiveMotifIndex(-1);
    setControls((previous) =>
      score ? { ...previous, focusBar: clampFocusBar(score, previous.focusBar) } : previous,
    );
    // Only the identity of the assignment matters here, not the score object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, stopPlayback]);

  // ---- Playhead ------------------------------------------------------------

  // Runs on requestAnimationFrame and writes the playhead straight to the DOM.
  // React state is touched only when something visible changes: the count-in
  // beat, the bar, or the motif note. Crossing a bar line is reported to the
  // session so due steps change on the beat, never mid-bar.
  useEffect(() => {
    const playhead = playheadRef.current;
    if (!playingRequest) {
      if (playhead) playhead.hidden = true;
      return;
    }
    const score = playingRequest.score;
    const motifNotes = motifCycleNotes(score);
    let frame = 0;
    let lastBar = -1;
    let lastCountIn = -1;
    let lastBeat = Number.NaN;
    let lastMotifIndex = -2;
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
          playhead.style.left = `${(position.sourceBeat / score.meta.totalBeats) * 100}%`;
        }
        if (position.barIndex !== lastBar) {
          lastBar = position.barIndex;
          setPlayheadBar(position.barIndex);
        }
        if (crossedBarBoundary(lastBeat, position.sourceBeat, score.meta.beatsPerBar)) {
          dispatch({ type: "barBoundary" });
        }
        lastBeat = position.sourceBeat;
        if (viewRef.current === "notes") {
          const motifIndex = activeMotifNoteIndex(motifNotes, score, position.sourceBeat);
          if (motifIndex !== lastMotifIndex) {
            lastMotifIndex = motifIndex;
            setActiveMotifIndex(motifIndex);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bridge, playingRequest]);

  // ---- Keyboard ------------------------------------------------------------

  // The keyboard teaches the bar in front of the player: the selected bar if
  // there is one, otherwise the bar under the playhead. Chord by chord also marks
  // the voicing's exact keys and dims everything outside the chord.
  const overlayBar = controls.focusBar ?? playheadBar;
  useEffect(() => {
    const keyboard = bridge.getKeyboardElement();
    if (!keyboard || !score) return;
    const bar = score.bars[overlayBar] ?? score.bars[0];
    applyKeyboardOverlay(keyboard, {
      score,
      barIndex: bar.barIndex,
      lens: controls.lens,
      labelMode,
      shape: view === "chords" ? chordShapeMidis(bar) : null,
      dimOutsideChord: view === "chords",
    });
  }, [bridge, score, overlayBar, controls.lens, labelMode, view]);

  useEffect(
    () => () => {
      const keyboard = bridge.getKeyboardElement();
      if (keyboard) clearKeyboardOverlay(keyboard);
    },
    [bridge],
  );

  // Show me what I played: mirror every input onto the keyboard as a ring. This
  // writes to the DOM directly on each event; React state changes only when the
  // count of notes played off the visible keys changes.
  useEffect(() => {
    let held = EMPTY_HELD_NOTES;
    let lastOff = "0:0";
    const unsubscribe = bridge.noteInput.subscribe((event) => {
      held = reduceHeldNotes(held, event);
      const keyboard = bridge.getKeyboardElement();
      if (!keyboard) return;
      const off = applyPlayedKeys(keyboard, playedNotes(held));
      const key = `${off.below}:${off.above}`;
      if (key !== lastOff) {
        lastOff = key;
        setOffKeyboard(off);
      }
    });
    return () => {
      unsubscribe();
      const keyboard = bridge.getKeyboardElement();
      if (keyboard) applyPlayedKeys(keyboard, new Map());
    };
  }, [bridge]);

  const stepChordBy = useCallback(
    (direction: 1 | -1) => {
      if (!score) return;
      updateControls({ focusBar: stepChord(score, controls.focusBar ?? playheadBar, direction) });
    },
    [controls.focusBar, playheadBar, score, updateControls],
  );

  // ---- Session -------------------------------------------------------------

  const controlsForStep = useCallback(
    (step: SessionStep, from: PracticeControls): PracticeControls => {
      if (!score) return from;
      const next = controlsForView(step.view, { ...from, focusBar: null }, score);
      return step.lens ? { ...next, lens: step.lens } : next;
    },
    [score],
  );

  const appliedStep = useRef<number | null>(null);

  const startSession = useCallback(
    async (resumeId?: string) => {
      if (!score) return;
      dispatch({ type: "start", length: sessionLength, hasMotif: hasMotif(score) });
      appliedStep.current = 0;
      const [firstStep] = sessionSteps(hasMotif(score));
      const next = controlsForStep(firstStep, controls);
      setView(firstStep.view);
      setControls(next);
      if (!(await startPlayback(next, { countIn: true }))) {
        dispatch({ type: "end" });
        appliedStep.current = null;
        return;
      }
      const record = bridge.practiceHistory.beginCurrent(resumeId);
      if (!record) return;
      activePracticeRef.current = { id: record.id, baseDurationMs: record.activeDurationMs };
      practisedHandsRef.current = new Set(record.handsPractised);
      visitedBarsRef.current = new Set(record.barsVisited);
      usedLensesRef.current = new Set(record.learningLenses);
      lastPracticeWriteRef.current = "";
    },
    [bridge.practiceHistory, controls, controlsForStep, score, sessionLength, startPlayback],
  );

  // Monotonic, visible-page deltas: clock corrections and time spent in a
  // background tab never become claimed active practice time.
  useEffect(() => {
    if (session.status !== "running") return;
    let last = performance.now();
    let visible = document.visibilityState !== "hidden";
    const onVisibility = () => {
      visible = document.visibilityState !== "hidden";
      last = performance.now();
    };
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsedMs = visibleTimerDelta(last, now, visible && document.visibilityState !== "hidden");
      last = now;
      if (elapsedMs) dispatch({ type: "tick", elapsedMs });
    }, TIMER_TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session.status]);

  // A step whose time is up waits for the next bar line - unless nothing is
  // playing, in which case there is no bar line to wait for.
  useEffect(() => {
    if (session.status === "running" && session.advanceDue && !playingRequest) dispatch({ type: "next" });
  }, [session, playingRequest]);

  // Entering a new step sets its view and hands and carries playback across.
  const activeStepIndex =
    session.status === "running" || session.status === "paused" ? session.stepIndex : null;
  useEffect(() => {
    if (activeStepIndex == null || session.status === "complete" || session.status === "idle") return;
    if (appliedStep.current === activeStepIndex) return;
    appliedStep.current = activeStepIndex;
    const step = session.steps[activeStepIndex];
    const next = controlsForStep(step, controls);
    setView(step.view);
    applyControls(next);
    // Only a step change should run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepIndex]);

  const activityFor = useCallback(
    (state: typeof session) => {
      if (controls.lens === "both" || controls.lens === "lh") practisedHandsRef.current.add("left");
      if (controls.lens === "both" || controls.lens === "rh") practisedHandsRef.current.add("right");
      if (score) visitedBarsRef.current.add((controls.focusBar ?? playheadBar) + 1);
      if (state.status === "running" || state.status === "paused")
        usedLensesRef.current.add(state.steps[state.stepIndex].id);
      if (state.status !== "idle")
        Object.keys(state.timeByStep).forEach((lens) => usedLensesRef.current.add(lens as LearningLens));
      const elapsed = state.status === "idle" ? 0 : state.elapsedMs;
      return {
        activeDurationMs: (activePracticeRef.current?.baseDurationMs ?? 0) + elapsed,
        endingTempo: bridge.getTempoBpm(),
        handsPractised: [...practisedHandsRef.current],
        barsVisited: [...visitedBarsRef.current],
        learningLenses: [...usedLensesRef.current],
      };
    },
    [bridge, controls.focusBar, controls.lens, playheadBar, score],
  );

  // Persist coarse progress while practising. The record is already incomplete,
  // so closing the tab between writes still leaves an honest continuation point.
  useEffect(() => {
    const active = activePracticeRef.current;
    if (!active || (session.status !== "running" && session.status !== "paused")) return;
    const activity = activityFor(session);
    const signature = JSON.stringify([
      Math.floor(activity.activeDurationMs / 1000),
      activity.endingTempo,
      activity.handsPractised,
      activity.barsVisited,
      activity.learningLenses,
    ]);
    if (signature === lastPracticeWriteRef.current) return;
    lastPracticeWriteRef.current = signature;
    bridge.practiceHistory.update(active.id, activity);
  }, [activityFor, bridge.practiceHistory, session]);

  useEffect(() => {
    if (session.status === "complete" || session.status === "idle") {
      appliedStep.current = null;
      if (session.status === "complete") {
        stopPlayback();
        const active = activePracticeRef.current;
        if (active) {
          bridge.practiceHistory.finish(active.id, "completed", activityFor(session));
          activePracticeRef.current = null;
        }
      }
    }
  }, [activityFor, bridge.practiceHistory, session, stopPlayback]);

  const pauseSession = useCallback(() => {
    stopPlayback();
    dispatch({ type: "pause" });
  }, [stopPlayback]);

  const resumeSession = useCallback(async () => {
    if (await startPlayback(controls, { countIn: true })) dispatch({ type: "resume" });
  }, [controls, startPlayback]);

  const endSession = useCallback(() => {
    stopPlayback();
    const active = activePracticeRef.current;
    if (active) {
      bridge.practiceHistory.finish(active.id, "abandoned", activityFor(session));
      activePracticeRef.current = null;
    }
    dispatch({ type: "end" });
  }, [activityFor, bridge.practiceHistory, session, stopPlayback]);

  const againInNewKey = useCallback(() => {
    pendingSessionStart.current = true;
    if (!bridge.rerollIntoNewKey()) pendingSessionStart.current = false;
  }, [bridge]);

  const openAssignmentWorkspace = useCallback(() => {
    const workspace = assignmentWorkspaceRef.current;
    if (!workspace) return;
    workspace.open = true;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    workspace.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    workspace.querySelector("summary")?.focus();
  }, []);

  useEffect(() => {
    if (!pendingSessionStart.current || !score) return;
    pendingSessionStart.current = false;
    void startSession();
    // Fires once the new key's assignment has been committed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;
  const handleHistoryAction = useCallback(
    (action: HistoryAction, record: PracticeRecord, bar?: number) => {
      const newKey = action === "newKey";
      if (!bridge.practiceHistory.open(record.id, { newKey })) {
        bridge.reportError("That practice assignment could not be opened.");
        return;
      }
      if (action === "faster")
        bridge.soundSettings.setTempo(Math.min(140, Math.max(60, record.endingTempo + 5)));
      if (session.status === "complete") dispatch({ type: "end" });
      requestAnimationFrame(() => {
        if (action === "focus") {
          const focusBar = Math.max(0, (bar ?? record.needsWorkBars[0] ?? 1) - 1);
          setView("hands");
          setControls((previous) => ({ ...previous, lens: "both", focusBar }));
          return;
        }
        void startSessionRef.current(action === "resume" ? record.id : undefined);
      });
    },
    [bridge, session.status],
  );

  // ---- Render --------------------------------------------------------------

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

  const header = (
    <SessionHeader
      sentence={sentence}
      readinessNote={readinessNote}
      ready={ready}
      session={session}
      length={sessionLength}
      onLengthChange={setSessionLength}
      onStart={() => void startSession()}
      onPause={pauseSession}
      onResume={() => void resumeSession()}
      onNext={() => dispatch({ type: "next" })}
      onPrevious={() => dispatch({ type: "previous" })}
      onEnd={endSession}
      onAgainNewKey={againInNewKey}
    />
  );

  // Star, share and reopen sit with the other assignment actions, below the
  // keyboard, so they never add height to the sticky header on a phone.
  const libraryControls = score ? (
    <LibraryControls
      library={bridge.library}
      canOpen={session.status === "idle" || session.status === "complete"}
      onOpened={() => {
        if (session.status === "complete") dispatch({ type: "end" });
      }}
    />
  ) : null;

  return (
    <>
      {summaryContainer ? createPortal(header, summaryContainer) : header}
      {inputContainer
        ? createPortal(
            <MidiControl
              midi={bridge.midiInput}
              setPlayThrough={bridge.setMidiPlayThrough}
              offKeyboard={offKeyboard}
            />,
            inputContainer,
          )
        : null}

      <AssignmentWorkspace editor={bridge.assignmentEditor} detailsRef={assignmentWorkspaceRef} />

      <PracticePanel
        score={score}
        view={view}
        controls={controls}
        labelMode={labelMode}
        ready={ready}
        playing={!!playingRequest}
        countInBeat={countInBeat}
        chordBar={controls.focusBar ?? playheadBar}
        activeMotifIndex={activeMotifIndex}
        playheadRef={playheadRef}
        onView={selectView}
        onControls={updateControls}
        onLabelMode={setLabelMode}
        onTogglePlayback={togglePlayback}
        onStepChord={stepChordBy}
        onChangeAssignment={openAssignmentWorkspace}
        assignmentActions={libraryControls}
      />
      <PracticeHistory
        history={bridge.practiceHistory}
        canOpen={session.status === "idle" || session.status === "complete"}
        onAction={handleHistoryAction}
      />
      <ScaleReference scale={assignment?.scale ?? null} audition={bridge.scaleAudition} ready={ready} />
      <StatusLine status={bridge.status} />
      {settingsContainer
        ? createPortal(
            <SoundSettings settings={bridge.soundSettings} sampler={samplerSnapshot} />,
            settingsContainer,
          )
        : null}
    </>
  );
}
