import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";
import type { AssignmentInputs, AssignmentLocks } from "../domain/assignment.js";
import { checkMotifOffer, validateAssignmentInputs } from "../domain/assignment.js";
import { PRESET_CONFIGS } from "../presets.js";
import {
  LEFT_HAND_PATTERN_METADATA,
  MOTIF_STYLES,
  NOTE_NAMES,
  PROGRESSION_PRESETS,
  SCALE_PATTERNS,
  STYLE_PROFILES,
  getChordTagForSymbol,
  getStyleProfile,
  labelRomanWithTag,
  motifFitForMode,
  parseRomanSymbol,
} from "../theory.js";
import type { AssignmentEditor, AssignmentEditorResult } from "./bridge.js";
import { PRESET_FEELS } from "./feel.js";
import { Icon } from "./Icon.js";

type AssignmentWorkspaceProps = {
  editor: AssignmentEditor;
  detailsRef: RefObject<HTMLDetailsElement | null>;
};

const KEY_LABELS: Record<string, string> = {
  "C#": "C♯ / D♭",
  "D#": "D♯ / E♭",
  "F#": "F♯ / G♭",
  "G#": "G♯ / A♭",
  "A#": "A♯ / B♭",
};

const MODE_DESCRIPTIONS: Record<string, string> = {
  major: "open, bright",
  minor: "moody, reflective",
  pentatonicMajor: "sunny, nothing clashes",
  pentatonicMinor: "earthy, soulful",
  harmonicMinor: "dark, dramatic pull",
  melodicMinor: "bittersweet, smooth",
  majorBlues: "relaxed, a little grit",
  minorBlues: "smoky, gritty",
};

const LEFT_HAND_LABELS: Record<string, string> = {
  block: "Block chords",
  alberti: "Alberti bass",
  broken: "Broken arpeggios",
  oompah: "Oom-pah (bass + chords)",
  "root-5th-oct": "Root–fifth–octave bass",
  "pop-8ths": "Pop eighths (root/octave)",
  "power-8ths": "Power fifths eighths",
  pedal: "Pedal root + off-beat chords",
  stride: "Light stride",
  walking: "Walking bass (advanced)",
};

const LOCK_LABELS: Record<keyof AssignmentLocks, string> = {
  key: "key",
  harmony: "harmony",
  groove: "groove",
  motif: "motif",
};

const FRIENDLY_ERRORS: Record<string, string> = {
  "custom progressions require at least one chord": "Add at least one chord to use your custom palette.",
};

const PALETTE_SETS: Record<string, readonly { label: string; chords: readonly string[] }[]> = {
  classical: [
    { label: "Core diatonics", chords: ["I", "ii", "iii", "IV", "V", "vi", "viio"] },
    { label: "Diatonic sevenths", chords: ["Imaj7", "ii7", "V7", "vi7", "viio7"] },
    { label: "Borrowed / modal", chords: ["iv", "bVII", "bVI", "bIII"] },
    { label: "Secondary dominants", chords: ["V/V", "V/ii", "V/vi", "V/IV"] },
  ],
  pop: [
    { label: "Core progressions", chords: ["I", "V", "vi", "IV", "ii", "iii"] },
    { label: "Dreamy sevenths", chords: ["Imaj7", "IVmaj7", "V7", "vi7"] },
    { label: "Borrowed hooks", chords: ["bVII", "bIII", "bVI", "iv"] },
    { label: "Lift / drive", chords: ["V/vi", "V/IV", "V/V", "ii7"] },
  ],
  jazz: [
    { label: "Cadence staples", chords: ["ii7", "V7", "Imaj7", "vi7"] },
    { label: "Extended dominants", chords: ["V/ii", "V/iii", "V/vi", "bII7"] },
    { label: "Chromatic colors", chords: ["iii7", "bIII7", "bVII7", "bVImaj7"] },
    { label: "Minor and diminished", chords: ["iio7", "viio7", "iv7", "i7"] },
  ],
  modal: [
    { label: "Centers and pedals", chords: ["I", "bVII", "bVI", "v"] },
    { label: "Floating sevenths", chords: ["Imaj7", "bVII7", "iv7", "i7"] },
    { label: "Colors", chords: ["bII", "bIII", "bVI", "bVII"] },
    { label: "Lift / motion", chords: ["ii", "IV", "V", "bIII7"] },
  ],
};
const STYLES = STYLE_PROFILES as Record<string, { label: string }>;

export function AssignmentWorkspace({ editor, detailsRef }: AssignmentWorkspaceProps) {
  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  const [draft, setDraft] = useState<AssignmentInputs>(() => cloneInputs(snapshot.inputs));
  const [feedback, setFeedback] = useState<AssignmentEditorResult | null>(null);

  useEffect(() => {
    setDraft(cloneInputs(snapshot.inputs));
  }, [snapshot.inputs]);

  const dirty = !sameInputs(draft, snapshot.inputs);
  const validation = validateAssignmentInputs(draft);
  const motifOffer =
    draft.motifId === "none" ? { offered: true, reason: null, variant: null } : checkMotifOffer(draft);
  const canApply = dirty && validation.valid && motifOffer.offered;
  const draftProblem = !validation.valid
    ? FRIENDLY_ERRORS[validation.errors[0]] || `Can't build that yet: ${validation.errors.join("; ")}.`
    : !motifOffer.offered
      ? `${motifOffer.reason}${motifOffer.variant ? ` Try ${MOTIF_STYLES[motifOffer.variant]?.label ?? motifOffer.variant}.` : ""}`
      : null;

  const palette = useMemo(() => PALETTE_SETS[draft.styleId] ?? PALETTE_SETS.classical ?? [], [draft.styleId]);

  const patchDraft = (patch: Partial<AssignmentInputs>) => {
    setDraft((current) => ({ ...current, ...patch, presetId: null }));
    setFeedback(null);
  };

  const run = (operation: () => AssignmentEditorResult) => {
    const result = operation();
    setFeedback(result);
  };

  const applyDraft = () => {
    const result = editor.apply(draft);
    setFeedback(result);
  };

  const field = (label: string, id: string, select: ReactNode, lock?: keyof AssignmentLocks) => (
    <div className="assignment-field">
      <label htmlFor={id}>{label}</label>
      {select}
      {lock ? (
        <button
          type="button"
          className="assignment-lock coach-icon-button"
          aria-pressed={snapshot.locks[lock]}
          aria-label={`Lock ${LOCK_LABELS[lock]}`}
          onClick={() => editor.toggleLock(lock)}
        >
          <Icon name="lock" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <details id="assignment-workspace" className="assignment-workspace" ref={detailsRef}>
      <summary>Change the assignment</summary>
      <p className="assignment-lead">Pick how you want it to feel. Shape the details if you like.</p>
      <div className="assignment-workspace-body">
        <section aria-labelledby="assignment-feels-title">
          <h3 id="assignment-feels-title" className="coach-eyebrow">
            Start from a feel
          </h3>
          <ul className="assignment-presets">
            {PRESET_CONFIGS.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  className="assignment-preset"
                  aria-pressed={snapshot.inputs.presetId === preset.id}
                  onClick={() => run(() => editor.applyPreset(preset.id))}
                >
                  <span className="assignment-preset-feel">{PRESET_FEELS[preset.id] ?? preset.name}</span>
                  <span className="assignment-preset-name">{preset.name}</span>
                  <span className="assignment-preset-key">{presetKey(preset.key, preset.mode)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <form
          className="assignment-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canApply) applyDraft();
          }}
        >
          <details className="assignment-shape" open>
            <summary>Shape it yourself</summary>
            <div className="assignment-fields">
              {field(
                "Key",
                "key-select",
                <select
                  id="key-select"
                  value={draft.key}
                  onChange={(event) => patchDraft({ key: event.target.value })}
                >
                  {NOTE_NAMES.map((key) => (
                    <option key={key} value={key}>
                      {KEY_LABELS[key] ?? key}
                    </option>
                  ))}
                </select>,
                "key",
              )}
              {field(
                "Colour",
                "mode-select",
                <select
                  id="mode-select"
                  value={draft.mode}
                  onChange={(event) => patchDraft({ mode: event.target.value })}
                >
                  {Object.entries(SCALE_PATTERNS).map(([id, mode]) => (
                    <option key={id} value={id}>
                      {mode.label}: {MODE_DESCRIPTIONS[id] ?? ""}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                "Chords",
                "progression-select",
                <select
                  id="progression-select"
                  value={draft.progressionPresetId}
                  onChange={(event) => patchDraft({ progressionPresetId: event.target.value })}
                >
                  {PROGRESSION_PRESETS.map((progression) => (
                    <option key={progression.id} value={progression.id}>
                      {progression.label} · {progression.roman.join("–")}
                    </option>
                  ))}
                  <option value="custom">Custom progression</option>
                </select>,
                "harmony",
              )}
              {field(
                "Left hand",
                "lh-select",
                <select
                  id="lh-select"
                  value={draft.lhId}
                  onChange={(event) => patchDraft({ lhId: event.target.value })}
                >
                  {Object.keys(LEFT_HAND_PATTERN_METADATA).map((id) => (
                    <option key={id} value={id}>
                      {LEFT_HAND_LABELS[id] ?? id}
                    </option>
                  ))}
                </select>,
                "groove",
              )}
              {field(
                "Tune",
                "motif-select",
                <select
                  id="motif-select"
                  value={draft.motifId}
                  onChange={(event) => patchDraft({ motifId: event.target.value })}
                >
                  <option value="none">No tune: left hand only</option>
                  {Object.entries(MOTIF_STYLES).map(([id, motif]) => {
                    const offered = checkMotifOffer({ ...draft, motifId: id });
                    const fit = motifFitForMode(id, draft.mode);
                    return (
                      <option key={id} value={id} disabled={!offered.offered}>
                        {motif.label}
                        {!offered.offered ? " (not offered)" : fit?.fit === "color" ? " (colour tones)" : ""}
                      </option>
                    );
                  })}
                </select>,
                "motif",
              )}
              {field(
                "Style",
                "palette-level",
                <select
                  id="palette-level"
                  value={draft.styleId}
                  onChange={(event) => patchDraft({ styleId: event.target.value })}
                >
                  {Object.entries(STYLE_PROFILES).map(([id, style]) => (
                    <option key={id} value={id}>
                      {style.label}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                "Length",
                "length-select",
                <select
                  id="length-select"
                  value={String(draft.length)}
                  onChange={(event) => patchDraft({ length: Number(event.target.value) })}
                >
                  {[4, 8, 12].map((length) => (
                    <option key={length} value={length}>
                      {length} bars
                    </option>
                  ))}
                </select>,
              )}
            </div>

            {draft.progressionPresetId === "custom" ? (
              <fieldset className="assignment-palette">
                <legend>Custom progression ({draft.customProgressionRoman.length} bars)</legend>
                <p>Choose chords from the {STYLES[draft.styleId]?.label ?? draft.styleId} palette.</p>
                {palette.map((group) => (
                  <div className="assignment-palette-group" key={group.label}>
                    <span>{group.label}</span>
                    <div>
                      {group.chords.map((chord) => (
                        <button
                          key={`${group.label}-${chord}`}
                          type="button"
                          onClick={() =>
                            patchDraft({ customProgressionRoman: [...draft.customProgressionRoman, chord] })
                          }
                        >
                          {formatPaletteChord(chord, draft)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p id="custom-progression-preview" className="assignment-custom-preview">
                  {draft.customProgressionRoman.length
                    ? draft.customProgressionRoman
                        .map((chord) => formatPaletteChord(chord, draft))
                        .join(" – ")
                    : "No chords yet. Add at least one chord to build a custom progression."}
                </p>
                <div className="assignment-palette-actions">
                  <button
                    type="button"
                    disabled={!draft.customProgressionRoman.length}
                    onClick={() =>
                      patchDraft({ customProgressionRoman: draft.customProgressionRoman.slice(0, -1) })
                    }
                  >
                    Remove last
                  </button>
                  <button
                    type="button"
                    disabled={!draft.customProgressionRoman.length}
                    onClick={() => patchDraft({ customProgressionRoman: [] })}
                  >
                    Clear
                  </button>
                </div>
              </fieldset>
            ) : null}

            <div className="coach-session assignment-variation">
              <button
                id="assignment-reroll"
                type="button"
                className="coach-secondary"
                disabled={dirty || Object.values(snapshot.locks).every(Boolean)}
                onClick={() => run(editor.reroll)}
              >
                <Icon name="dice" />
                Surprise me
              </button>
              <button
                type="button"
                className="coach-secondary coach-icon-button"
                aria-label="Undo"
                disabled={!snapshot.canUndo || dirty}
                onClick={() => run(editor.undo)}
              >
                <Icon name="undo" />
              </button>
              <button
                type="button"
                className="coach-secondary coach-icon-button"
                aria-label="Redo"
                disabled={!snapshot.canRedo || dirty}
                onClick={() => run(editor.redo)}
              >
                <Icon name="redo" />
              </button>
              <p className="assignment-seed">
                Variation <code id="assignment-seed">{snapshot.seed}</code>
                {snapshot.assignmentId ? (
                  <span id="assignment-id"> · ID {snapshot.assignmentId.replace(/^assignment-/, "")}</span>
                ) : null}
              </p>
            </div>
          </details>

          {draftProblem ? (
            <p className="assignment-feedback error" role="alert">
              {draftProblem}
            </p>
          ) : null}
          {feedback ? (
            <p className={`assignment-feedback ${feedback.ok ? "success" : "error"}`} role="status">
              {feedback.message}
            </p>
          ) : null}

          <div className="assignment-form-actions">
            <button id="generate" type="submit" className="coach-start" disabled={!canApply}>
              Apply assignment
            </button>
            <p className="assignment-foot-note">
              {dirty && !draftProblem
                ? "Changes are ready to apply."
                : "The keyboard keeps playing while you choose."}{" "}
              {dirty ? (
                <button
                  type="button"
                  className="coach-link"
                  onClick={() => {
                    setDraft(cloneInputs(snapshot.inputs));
                    setFeedback(null);
                  }}
                >
                  Reset changes
                </button>
              ) : null}
            </p>
          </div>
        </form>
      </div>
    </details>
  );
}

function presetKey(key: string, mode: string): string {
  const name = KEY_LABELS[key]?.split(" / ")[1] ?? key;
  return /minor/i.test(mode) ? `${name}m` : name;
}

function cloneInputs(inputs: AssignmentInputs): AssignmentInputs {
  return { ...inputs, customProgressionRoman: [...inputs.customProgressionRoman] };
}

function sameInputs(left: AssignmentInputs, right: AssignmentInputs): boolean {
  return (
    left.key === right.key &&
    left.mode === right.mode &&
    left.progressionPresetId === right.progressionPresetId &&
    left.styleId === right.styleId &&
    left.length === right.length &&
    left.lhId === right.lhId &&
    left.motifId === right.motifId &&
    left.presetId === right.presetId &&
    left.seed === right.seed &&
    left.customProgressionRoman.join("\u0000") === right.customProgressionRoman.join("\u0000")
  );
}

function formatPaletteChord(chord: string, inputs: AssignmentInputs): string {
  const parsed = parseRomanSymbol(chord);
  const tag = getChordTagForSymbol(chord, {
    mode: inputs.mode,
    parsed,
    preferModeQuality: true,
    styleProfile: getStyleProfile(inputs.styleId),
    applyStyleOverrides: true,
  });
  return labelRomanWithTag(chord, tag, parsed);
}
