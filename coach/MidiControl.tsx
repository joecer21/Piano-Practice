import { useState, useSyncExternalStore } from "react";
import { ALL_INPUTS } from "../input/midi.js";
import type { MidiInput } from "../input/midi.js";
import type { OffKeyboard } from "./played-keys.js";

type MidiControlProps = {
  midi: MidiInput;
  setPlayThrough: (enabled: boolean) => Promise<void>;
  offKeyboard: OffKeyboard;
};

/**
 * Connect a MIDI keyboard and mirror it. Progressive enhancement throughout:
 * permission is requested only on click, and a browser without Web MIDI gets
 * one line of explanation instead of a control that cannot work.
 */
export function MidiControl({ midi, setPlayThrough, offKeyboard }: MidiControlProps) {
  const state = useSyncExternalStore(midi.subscribe, midi.getState);
  const [changing, setChanging] = useState(false);

  const offText = describeOffKeyboard(offKeyboard);

  switch (state.status) {
    case "unsupported":
      return (
        <p className="coach-midi coach-midi-note">
          MIDI keyboards work in Chrome, Edge and Firefox; this browser does not support them.
        </p>
      );
    case "insecure":
      return (
        <p className="coach-midi coach-midi-note">MIDI keyboards need the page to be served over https.</p>
      );
    case "idle":
      return (
        <div className="coach-midi">
          <button type="button" className="coach-secondary" onClick={() => void midi.connect()}>
            Connect MIDI keyboard
          </button>
        </div>
      );
    case "requesting":
      return (
        <p className="coach-midi coach-midi-note" role="status">
          Waiting for MIDI permission…
        </p>
      );
    case "denied":
      return (
        <div className="coach-midi">
          <span className="coach-midi-note" role="status">
            {state.message}
          </span>
          <button type="button" className="coach-secondary" onClick={() => void midi.connect()}>
            Try again
          </button>
        </div>
      );
    case "connected":
      return (
        <div className="coach-midi" role="group" aria-label="MIDI keyboard">
          {state.devices.length === 0 ? (
            <span className="coach-midi-note" role="status">
              No MIDI keyboard found. Plug one in and it will appear here.
            </span>
          ) : state.devices.length === 1 ? (
            <span className="coach-midi-note" role="status">
              Mirroring {state.devices[0].name}
            </span>
          ) : (
            <label className="coach-midi-select">
              <span>MIDI input</span>
              <select value={state.selectedId} onChange={(event) => midi.selectInput(event.target.value)}>
                <option value={ALL_INPUTS}>All MIDI inputs</option>
                {state.devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="coach-toggle"
            aria-pressed={state.playThrough}
            disabled={changing}
            onClick={async () => {
              setChanging(true);
              try {
                await setPlayThrough(!state.playThrough);
              } finally {
                setChanging(false);
              }
            }}
          >
            Play through the app
          </button>
          {offText ? <span className="coach-midi-note">{offText}</span> : null}
        </div>
      );
  }
}

export function describeOffKeyboard({ below, above }: OffKeyboard): string {
  if (below && above) return "Some notes are outside the keys shown.";
  if (below) return "Playing below the keys shown.";
  if (above) return "Playing above the keys shown.";
  return "";
}
