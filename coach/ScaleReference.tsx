import { useState, useSyncExternalStore } from "react";
import type { ScaleAudition } from "./bridge.js";

type ScaleReferenceProps = {
  scale: { name?: string; notes?: readonly string[] } | null;
  audition: ScaleAudition;
  ready: boolean;
};

/** A compact home for the only useful audition the Score views do not replace. */
export function ScaleReference({ scale, audition, ready }: ScaleReferenceProps) {
  const state = useSyncExternalStore(audition.subscribe, audition.getSnapshot);
  const [loop, setLoop] = useState(false);
  const notes = scale?.notes ?? [];

  return (
    <details id="scale-reference" className="coach-scale-reference">
      <summary>Scale reference</summary>
      <div className="coach-scale-reference-body">
        <div>
          <h2>{scale?.name || "Scale"}</h2>
          <ol className="coach-scale-notes" aria-label="Scale notes">
            {notes.map((note, index) => (
              <li key={`${note}-${index}`} aria-current={stripOctave(state.activeNote) === note || undefined}>
                {note}
              </li>
            ))}
          </ol>
        </div>
        <div className="coach-settings-actions">
          <button
            type="button"
            className="coach-secondary"
            disabled={!ready || !notes.length}
            aria-pressed={state.playing}
            onClick={() => (state.playing ? audition.stop() : void audition.play(loop))}
          >
            {state.playing ? "Stop scale" : "Play scale"}
          </button>
          <label className="coach-check" htmlFor="scale-loop">
            <input
              id="scale-loop"
              type="checkbox"
              checked={loop}
              onChange={(event) => setLoop(event.target.checked)}
            />{" "}
            Loop
          </label>
        </div>
      </div>
    </details>
  );
}

function stripOctave(note: string | null): string | null {
  return note?.replace(/-?\d+$/, "") ?? null;
}
