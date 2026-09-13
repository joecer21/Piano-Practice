import type { Ref } from "react";
import { createPortal } from "react-dom";
import { describeChordFunction, describeMotifParts } from "../domain/describe.js";
import type { Score } from "../domain/score.js";
import type { Feel } from "./feel.js";
import { Icon } from "./Icon.js";
import type { LabelMode } from "./keyboard-overlay.js";
import type { Lens, PracticeControls } from "./practice.js";
import { Timeline } from "./Timeline.js";
import type { BreakdownView } from "./views.js";
import { BREAKDOWN_VIEWS, hasMotif } from "./views.js";

type PracticePanelProps = {
  score: Score | null;
  /** What each hand does, in feel-first words, for the hands-apart view. */
  handsFeel?: Pick<Feel, "lh" | "rh"> | null;
  view: BreakdownView;
  controls: PracticeControls;
  labelMode: LabelMode;
  ready: boolean;
  playing: boolean;
  countInBeat: number | null;
  tempoBpm?: number;
  /** While a session runs the transport's main button pauses and resumes the session. */
  sessionStatus?: "idle" | "running" | "paused" | "complete";
  onPause?: () => void;
  onResume?: () => void;
  /** The bar whose chord the chord-by-chord view is showing. */
  chordBar: number;
  activeMotifIndex: number;
  playheadRef: Ref<HTMLDivElement>;
  /** Static hero slots inside the keyboard card: controls above, detail below the keys. */
  controlsContainer?: HTMLElement | null;
  detailContainer?: HTMLElement | null;
  timelineContainer?: HTMLElement | null;
  onView: (view: BreakdownView) => void;
  onControls: (patch: Partial<PracticeControls>) => void;
  onLabelMode: (mode: LabelMode) => void;
  onTogglePlayback: () => void;
  onStepChord: (direction: 1 | -1) => void;
};

const HAND_OPTIONS: ReadonlyArray<{ lens: Lens; label: string }> = [
  { lens: "both", label: "Both" },
  { lens: "lh", label: "Left hand" },
  { lens: "rh", label: "Right hand" },
];

/**
 * The practice controls of the hero: transport, hands, views and key labels above
 * the timeline, and the current view's detail below the keys. They are portalled
 * into the keyboard card so the instrument and its controls read as one object.
 */
export function PracticePanel(props: PracticePanelProps) {
  const { score, view, controls, labelMode, ready, playing, countInBeat, playheadRef } = props;
  const motifMissing = !!score && view === "notes" && !hasMotif(score);
  const status = props.sessionStatus ?? "idle";
  const inSession = status === "running" || status === "paused";

  const segmented = <T extends string>(
    label: string,
    options: ReadonlyArray<{ value: T; label: string }>,
    current: T,
    select: (value: T) => void,
    className = "",
  ) => (
    <div className={`coach-segmented ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={current === option.value}
          onClick={() => select(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const heroControls = (
    <div className="coach-hero-bar">
      <div className="coach-transport">
        {inSession ? (
          <button
            type="button"
            className="coach-play"
            onClick={status === "running" ? props.onPause : props.onResume}
          >
            <Icon name={status === "running" ? "pause" : "play"} />
            {status === "running" ? "Pause" : "Resume"}
          </button>
        ) : (
          <button
            type="button"
            className="coach-play"
            disabled={!ready || motifMissing}
            aria-pressed={playing}
            onClick={props.onTogglePlayback}
          >
            <Icon name={playing ? "pause" : "play"} />
            {playing ? "Stop" : "Play"}
          </button>
        )}
        <button
          type="button"
          className="coach-toggle"
          aria-pressed={controls.slow}
          onClick={() => props.onControls({ slow: !controls.slow })}
        >
          Half speed
        </button>
        <button
          type="button"
          className="coach-toggle"
          aria-pressed={controls.loop}
          onClick={() => props.onControls({ loop: !controls.loop })}
        >
          <Icon name="loop" />
          Loop
        </button>
        {props.tempoBpm ? <span className="coach-tempo">{props.tempoBpm} bpm</span> : null}
        <span className="coach-count-in" aria-hidden="true">
          {countInBeat != null ? `Count-in ${countInBeat}` : ""}
        </span>
      </div>
      <div className="coach-lenses">
        {segmented(
          "Hands",
          HAND_OPTIONS.map((option) => ({ value: option.lens, label: option.label })),
          controls.lens,
          (lens) => props.onControls({ lens }),
        )}
        {segmented(
          "Breakdown",
          BREAKDOWN_VIEWS.map((option) => ({ value: option.view, label: option.label })),
          view,
          props.onView,
          "coach-views",
        )}
        {segmented(
          "Key labels",
          [
            { value: "degrees" as LabelMode, label: "Degrees" },
            { value: "letters" as LabelMode, label: "Letters" },
          ],
          labelMode,
          props.onLabelMode,
        )}
      </div>
    </div>
  );

  const detail = score ? <ViewDetail {...props} score={score} /> : null;
  const timeline = score ? (
    <Timeline
      score={score}
      lens={controls.lens}
      focusBar={controls.focusBar}
      onSelectBar={(focusBar) => props.onControls({ focusBar })}
      playheadRef={playheadRef}
    />
  ) : null;

  if (props.controlsContainer && props.detailContainer && props.timelineContainer) {
    return (
      <>
        {createPortal(heroControls, props.controlsContainer)}
        {timeline ? createPortal(timeline, props.timelineContainer) : null}
        {detail ? createPortal(detail, props.detailContainer) : null}
      </>
    );
  }
  return (
    <section id="coach-practice" className="coach-practice-panel" aria-label="Practice">
      {heroControls}
      {timeline}
      {detail}
    </section>
  );
}

function ViewDetail(props: PracticePanelProps & { score: Score }) {
  const { score, view, controls } = props;

  if (view === "chords") {
    const bar = score.bars[props.chordBar] ?? score.bars[0];
    return (
      <div className="coach-detail" aria-live="polite">
        <div className="coach-session">
          <button type="button" className="coach-secondary" onClick={() => props.onStepChord(-1)}>
            Previous chord
          </button>
          <p className="coach-chord">
            <span className="coach-chord-name">{bar.chordSymbol}</span>{" "}
            <span className="coach-chord-count">
              Chord {bar.barIndex + 1} of {score.meta.bars}
            </span>
          </p>
          <button type="button" className="coach-secondary" onClick={() => props.onStepChord(1)}>
            Next chord
          </button>
        </div>
        <p className="coach-blurb">{describeChordFunction(bar, score)}</p>
        <p className="coach-hint">
          {controls.focusBar == null
            ? "Following playback. Step to hold one chord on the keyboard."
            : "The marked keys are this chord's shape. Copy it with your hands."}
        </p>
      </div>
    );
  }

  if (view === "notes") {
    const motif = describeMotifParts(score);
    if (!motif) {
      return (
        <p className="coach-detail coach-hint">
          This assignment has no tune. Change the assignment to add one.
        </p>
      );
    }
    return (
      <div className="coach-detail">
        <ol className="coach-motif" aria-label={`Motif degrees: ${motif.degrees.join(", ")}`}>
          {motif.degrees.map((degree, index) => (
            <li
              key={index}
              className="coach-motif-note"
              data-membership={motif.memberships[index]}
              aria-current={props.activeMotifIndex % motif.degrees.length === index ? "true" : undefined}
            >
              {degree}
              {motif.memberships[index] === "parentScale" ? (
                <span className="coach-visually-hidden"> (borrowed)</span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="coach-blurb">The motif {motif.contour}.</p>
        {motif.borrowedTones ? <p className="coach-hint">{motif.borrowedTones}</p> : null}
      </div>
    );
  }

  const focusedBar = controls.focusBar != null ? score.bars[controls.focusBar] : null;
  const hands = props.handsFeel;
  const handLines =
    view === "hands" && hands
      ? [controls.lens !== "rh" ? hands.lh : null, controls.lens !== "lh" ? hands.rh : null].filter(Boolean)
      : [];
  return (
    <>
      {handLines.length ? <p className="coach-blurb coach-detail">{handLines.join(" ")}</p> : null}
      <p className="coach-focus coach-detail" aria-live="polite">
        {focusedBar ? (
          <>
            <span>
              Bar {focusedBar.barIndex + 1} · {describeChordFunction(focusedBar, score)}
            </span>{" "}
            <button type="button" className="coach-link" onClick={() => props.onControls({ focusBar: null })}>
              Practice the whole piece
            </button>
          </>
        ) : (
          "Select a bar to practice it on its own."
        )}
      </p>
    </>
  );
}
