import type { Ref } from "react";
import { describeChordFunction, describeMotifParts } from "../domain/describe.js";
import type { Score } from "../domain/score.js";
import type { LabelMode } from "./keyboard-overlay.js";
import type { Lens, PracticeControls } from "./practice.js";
import { Timeline } from "./Timeline.js";
import type { BreakdownView } from "./views.js";
import { BREAKDOWN_VIEWS, hasMotif } from "./views.js";

type PracticePanelProps = {
  score: Score | null;
  view: BreakdownView;
  controls: PracticeControls;
  labelMode: LabelMode;
  ready: boolean;
  playing: boolean;
  countInBeat: number | null;
  /** The bar whose chord the chord-by-chord view is showing. */
  chordBar: number;
  activeMotifIndex: number;
  playheadRef: Ref<HTMLDivElement>;
  onView: (view: BreakdownView) => void;
  onControls: (patch: Partial<PracticeControls>) => void;
  onLabelMode: (mode: LabelMode) => void;
  onTogglePlayback: () => void;
  onStepChord: (direction: 1 | -1) => void;
  onChangeAssignment: () => void;
};

const HAND_OPTIONS: ReadonlyArray<{ lens: Lens; label: string }> = [
  { lens: "lh", label: "Left hand" },
  { lens: "rh", label: "Right hand" },
  { lens: "both", label: "Together" },
];

export function PracticePanel(props: PracticePanelProps) {
  const { score, view, controls, labelMode, ready, playing, countInBeat, playheadRef } = props;
  const motifMissing = !!score && view === "notes" && !hasMotif(score);

  return (
    <section className="coach-practice-panel" aria-label="Practice">
      <div className="coach-segmented coach-views" role="group" aria-label="Breakdown">
        {BREAKDOWN_VIEWS.map((option) => (
          <button
            key={option.view}
            type="button"
            aria-pressed={view === option.view}
            onClick={() => props.onView(option.view)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="coach-transport">
        <button
          type="button"
          className="coach-play"
          disabled={!ready || motifMissing}
          aria-pressed={playing}
          onClick={props.onTogglePlayback}
        >
          {playing ? "Stop" : "Play"}
        </button>
        <span className="coach-count-in" aria-hidden="true">
          {countInBeat != null ? `Count-in ${countInBeat}` : ""}
        </span>

        {view === "hands" ? (
          <div className="coach-segmented" role="group" aria-label="Hands">
            {HAND_OPTIONS.map((option) => (
              <button
                key={option.lens}
                type="button"
                aria-pressed={controls.lens === option.lens}
                onClick={() => props.onControls({ lens: option.lens })}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

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
          Loop
        </button>

        <div className="coach-segmented" role="group" aria-label="Key labels">
          <button
            type="button"
            aria-pressed={labelMode === "degrees"}
            onClick={() => props.onLabelMode("degrees")}
          >
            Degrees
          </button>
          <button
            type="button"
            aria-pressed={labelMode === "letters"}
            onClick={() => props.onLabelMode("letters")}
          >
            Letters
          </button>
        </div>
      </div>

      {score ? <ViewDetail {...props} score={score} /> : null}

      {score ? (
        <Timeline
          score={score}
          lens={controls.lens}
          focusBar={controls.focusBar}
          onSelectBar={(focusBar) => props.onControls({ focusBar })}
          playheadRef={playheadRef}
        />
      ) : null}

      <button type="button" className="coach-link coach-change" onClick={props.onChangeAssignment}>
        Change the assignment
      </button>
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
          This assignment has no motif. Change the assignment to add one.
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
                <span className="coach-visually-hidden"> (passing tone)</span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="coach-blurb">The motif {motif.contour}.</p>
        {motif.passingTones ? <p className="coach-hint">{motif.passingTones}</p> : null}
      </div>
    );
  }

  const focusedBar = controls.focusBar != null ? score.bars[controls.focusBar] : null;
  return (
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
  );
}
