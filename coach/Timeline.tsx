import { memo, useMemo } from "react";
import type { Ref } from "react";
import { describeChordFunction } from "../domain/describe.js";
import type { NoteEvent, PartId, Score } from "../domain/score.js";
import type { Lens } from "./practice.js";

type TimelineProps = {
  score: Score;
  lens: Lens;
  focusBar: number | null;
  onSelectBar: (barIndex: number | null) => void;
  playheadRef: Ref<HTMLDivElement>;
};

const BAR_UNITS = 100;
const LANE: Record<PartId, { top: number; bottom: number }> = {
  rh: { top: 4, bottom: 46 },
  lh: { top: 54, bottom: 96 },
};

/**
 * All bars, both hands, on one strip. Geometry comes straight from the Score, so
 * what is drawn is exactly what plays. Hue encodes the hand (via the lane class);
 * note role is encoded as fill weight through data-role, never as a colour.
 */
export const Timeline = memo(function Timeline({
  score,
  lens,
  focusBar,
  onSelectBar,
  playheadRef,
}: TimelineProps) {
  const width = score.meta.bars * BAR_UNITS;
  const beatUnits = BAR_UNITS / score.meta.beatsPerBar;
  const lanes = useMemo(
    () =>
      (["rh", "lh"] as const).map((part) => {
        const notes = score.parts[part].filter((event): event is NoteEvent => event.kind === "note");
        const midis = notes.map((note) => note.midi);
        const low = Math.min(...midis);
        const high = Math.max(...midis);
        const span = Math.max(high - low, 1);
        const { top, bottom } = LANE[part];
        return {
          part,
          notes: notes.map((note) => ({
            id: note.id,
            role: note.role,
            x: note.startBeat * beatUnits,
            w: Math.max(note.durationBeats * beatUnits - 1.5, 2),
            y: notes.length ? bottom - ((note.midi - low) / span) * (bottom - top - 3) - 3 : top,
          })),
        };
      }),
    [score, beatUnits],
  );

  return (
    <div className="coach-timeline" style={{ ["--timeline-bars" as string]: score.meta.bars }}>
      <div className="coach-timeline-bars" role="group" aria-label="Bars">
        {score.bars.map((bar) => {
          const selected = focusBar === bar.barIndex;
          const provenance =
            bar.provenance.kind === "diatonic"
              ? null
              : bar.provenance.kind === "secondaryDominant"
                ? "secondary"
                : "borrowed";
          return (
            <button
              key={bar.id}
              type="button"
              className="coach-timeline-bar"
              aria-pressed={selected}
              aria-label={`Bar ${bar.barIndex + 1}, ${bar.chordSymbol}. ${describeChordFunction(bar)}${
                selected ? " Selected; press again to play the whole piece." : " Select to practice this bar."
              }`}
              onClick={() => onSelectBar(selected ? null : bar.barIndex)}
            >
              <span className="coach-timeline-bar-number">{bar.barIndex + 1}</span>
              <span className="coach-timeline-chord">{bar.chordSymbol}</span>
              <span className="coach-timeline-roman">{bar.roman}</span>
              {provenance ? <span className="coach-timeline-badge">{provenance}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="coach-timeline-roll">
        <svg
          viewBox={`0 0 ${width} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
          className="coach-timeline-svg"
        >
          {focusBar != null ? (
            <rect
              className="coach-timeline-focus"
              x={focusBar * BAR_UNITS}
              y={0}
              width={BAR_UNITS}
              height={100}
            />
          ) : null}
          {score.bars.map((bar) => (
            <line
              key={bar.id}
              className="coach-timeline-barline"
              x1={bar.barIndex * BAR_UNITS}
              x2={bar.barIndex * BAR_UNITS}
              y1={0}
              y2={100}
            />
          ))}
          {lanes.map((lane) => (
            <g
              key={lane.part}
              className={`coach-timeline-lane hand-${lane.part}`}
              data-dimmed={lens !== "both" && lens !== lane.part ? "true" : undefined}
            >
              {lane.notes.map((note) => (
                <rect
                  key={note.id}
                  className="coach-timeline-note"
                  data-role={note.role}
                  x={note.x}
                  y={note.y}
                  width={note.w}
                  height={3}
                  rx={1}
                />
              ))}
            </g>
          ))}
        </svg>
        <div className="coach-timeline-playhead" ref={playheadRef} hidden />
        <span className="coach-timeline-lane-label coach-timeline-lane-label-rh">Right</span>
        <span className="coach-timeline-lane-label coach-timeline-lane-label-lh">Left</span>
      </div>
    </div>
  );
});
