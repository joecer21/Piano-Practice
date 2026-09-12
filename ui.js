// ui.js
// DOM caching, events, rendering.

import {
  parseRomanSymbol,
  labelRomanWithTag,
  stripOctave,
  noteStringToMidi,
  midiToNote,
  getChordTagForSymbol,
} from "./theory.js";

const MIX_PARTS = ["left", "lead"];

const CUSTOM_PALETTE_LIBRARY = {
  classical: [
    { label: "Core Diatonics", chords: ["I", "ii", "iii", "IV", "V", "vi", "viio"] },
    { label: "Diatonic 7ths", chords: ["Imaj7", "ii7", "V7", "vi7", "viio7"] },
    { label: "Borrowed / Modal", chords: ["iv", "bVII", "bVI", "bIII"] },
    { label: "Secondary Dominants", chords: ["V/V", "V/ii", "V/vi", "V/IV"] },
  ],
  pop: [
    { label: "Core Progressions", chords: ["I", "V", "vi", "IV", "ii", "iii"] },
    { label: "Dreamy 7ths", chords: ["Imaj7", "IVmaj7", "V7", "vi7"] },
    { label: "Borrowed Hooks", chords: ["bVII", "bIII", "bVI", "iv"] },
    { label: "Lift / Drive", chords: ["V/vi", "V/IV", "V/V", "ii7"] },
  ],
  jazz: [
    { label: "Cadence Staples", chords: ["ii7", "V7", "Imaj7", "vi7"] },
    { label: "Extended Dominants", chords: ["V/ii", "V/iii", "V/vi", "bII7"] },
    { label: "Chromatic Colors", chords: ["iii7", "bIII7", "bVII7", "bVImaj7"] },
    { label: "Minor & Dim", chords: ["iio7", "viio7", "iv7", "i7"] },
  ],
  modal: [
    { label: "Centers & Pedals", chords: ["I", "bVII", "bVI", "v"] },
    { label: "Floating 7ths", chords: ["Imaj7", "bVII7", "iv7", "i7"] },
    { label: "Colors", chords: ["bII", "bIII", "bVI", "bVII"] },
    { label: "Lift / Motion", chords: ["ii", "IV", "V", "bIII7"] },
  ],
};

const hasWindow = typeof window !== "undefined";
const scheduleTimeout = hasWindow ? window.setTimeout.bind(window) : setTimeout;
const clearScheduledTimeout = hasWindow ? window.clearTimeout.bind(window) : clearTimeout;

const FEEDBACK_CLASS_MAP = {
  soft: "mf-pulse",
  accent: "mf-accent",
  card: "mf-card",
  badge: "mf-badge",
  tap: "mf-tap",
  status: "mf-status",
  alert: "mf-alert",
};

const FEEDBACK_DURATION_MAP = {
  soft: 450,
  accent: 550,
  card: 950,
  badge: 600,
  tap: 350,
  status: 800,
  alert: 450,
};

const feedbackTimers = new WeakMap();
const STATUS_DEFAULT_TONE = "neutral";
const STATUS_TRANSIENT_MS = 4200;
export const QWERTY_PIANO_NOTES = Object.freeze({
  a: "C4",
  w: "C#4",
  s: "D4",
  e: "D#4",
  d: "E4",
  f: "F4",
  t: "F#4",
  g: "G4",
  y: "G#4",
  h: "A4",
  u: "A#4",
  j: "B4",
  k: "C5",
});
/** Z and X move the computer-key octave, as in most DAWs. */
export const QWERTY_OCTAVE_KEYS = Object.freeze({ z: -1, x: 1 });
const QWERTY_OCTAVE_SHIFT_RANGE = Object.freeze({ min: -2, max: 2 });

export function clampQwertyOctaveShift(shift) {
  return Math.min(QWERTY_OCTAVE_SHIFT_RANGE.max, Math.max(QWERTY_OCTAVE_SHIFT_RANGE.min, shift));
}

export function transposeOctaves(note, octaves) {
  const match = /^([A-G]#?)(-?\d+)$/.exec(note);
  return match ? `${match[1]}${Number(match[2]) + octaves}` : note;
}

function renderQwertyHelp(dom, shift) {
  const help = dom.pianoQwertyHelp || document.getElementById("piano-qwerty-help");
  if (!help) return;
  const low = transposeOctaves("C4", shift);
  const high = transposeOctaves("C5", shift);
  help.textContent = `Computer keys: A W S E D F T G Y H U J K play ${low}–${high}; Z and X change octave. Shortcuts pause while using a form control.`;
}

let statusResetTimer = null;
let lastPersistentStatus = "";

export function cacheDom() {
  const mixControls = MIX_PARTS.reduce((acc, part) => {
    acc[part] = {
      volume: document.getElementById(`mix-${part}-volume`),
      volumeLabel: document.getElementById(`mix-${part}-volume-value`),
      mute: document.getElementById(`mix-${part}-mute`),
    };
    return acc;
  }, {});

  return {
    presetSelect: document.getElementById("preset-select"),
    key: document.getElementById("key-select"),
    mode: document.getElementById("mode-select"),
    styleSelect: document.getElementById("palette-level"),
    paletteLevel: document.getElementById("palette-level"),
    progressionSelect: document.getElementById("progression-select"),
    paletteContainer: document.getElementById("chord-palette"),
    leftHand: document.getElementById("lh-select"),
    motif: document.getElementById("motif-select"),
    length: document.getElementById("length-select"),
    generate: document.getElementById("generate"),
    tempoSlider: document.getElementById("tempo-slider"),
    tempoValue: document.getElementById("tempo-value"),
    stopAll: document.getElementById("stop-all"),
    playAll: document.getElementById("play-all"),
    playAllLoop: document.getElementById("play-all-loop"),
    scaleLoop: document.getElementById("scale-loop"),
    lhLoop: document.getElementById("lh-loop"),
    motifLoop: document.getElementById("motif-loop"),
    loopToggle: document.getElementById("progression-loop"),
    scaleName: document.getElementById("scale-name"),
    scaleNotes: document.getElementById("scale-notes"),
    pianoVisual: document.getElementById("piano-visual"),
    pianoIndicatorRadios: document.querySelectorAll('input[name="piano-indicator-mode"]'),
    pianoGlissToggle: document.getElementById("piano-gliss-mode"),
    pianoComputerKeyboardToggle: document.getElementById("piano-computer-keyboard"),
    pianoChordMode: document.getElementById("piano-chord-mode"),
    pianoRoll: document.getElementById("piano-roll"),
    progressionRoman: document.getElementById("progression-roman"),
    progressionChords: document.getElementById("progression-chords"),
    progressionVisual: document.getElementById("progression-visual"),
    progressionDescription: document.getElementById("progression-description"),
    lhName: document.getElementById("lh-name"),
    lhDetails: document.getElementById("lh-details"),
    leftHandCard: document.getElementById("lh-card"),
    motifRhythm: document.getElementById("motif-rhythm"),
    motifPitches: document.getElementById("motif-pitches"),
    motifVisual: document.getElementById("motif-visual"),
    motifCard: document.getElementById("motif-card"),
    motifPlayhead: null,
    customPreview: document.getElementById("custom-progression-preview"),
    clearCustom: document.getElementById("clear-custom-progression"),
    statusLine: document.getElementById("status-line"),
    customHeader: document.getElementById("custom-progression-title"),
    playButtons: document.querySelectorAll(".play"),
    cards: document.querySelectorAll(".card"),
    playAllLoopBadge: document.getElementById("play-all-loop-badge"),
    pianoModel: document.getElementById("piano-model"),
    samplerStatus: document.getElementById("sampler-status"),
    pianoRollPlayhead: document.getElementById("piano-roll-playhead"),
    mixControls,
    mixCard: document.querySelector(".mix-card"),
    mixCardToggle: document.getElementById("mix-card-toggle"),
    advancedControlsCard: document.getElementById("advanced-controls-card"),
    advancedControlsToggle: document.getElementById("advanced-controls-toggle"),
    assignmentReroll: document.getElementById("assignment-reroll"),
    assignmentUndo: document.getElementById("assignment-undo"),
    assignmentRedo: document.getElementById("assignment-redo"),
    assignmentSeed: document.getElementById("assignment-seed"),
    assignmentId: document.getElementById("assignment-id"),
    assignmentLockButtons: document.querySelectorAll("[data-assignment-lock]"),
    humanizeToggle: document.getElementById("humanize-toggle"),
    humanizeAmount: document.getElementById("humanize-amount"),
    humanizeValue: document.getElementById("humanize-value"),
    swingAmount: document.getElementById("swing-amount"),
    swingValue: document.getElementById("swing-value"),
    reverbWet: document.getElementById("reverb-wet"),
    reverbWetValue: document.getElementById("reverb-wet-value"),
    roomSizeToggle: document.getElementById("room-size-toggle"),
    motifWidth: document.getElementById("motif-width"),
    motifWidthValue: document.getElementById("motif-width-value"),
  };
}

export function wireEvents(dom, handlers) {
  dom.generate?.addEventListener("click", handlers.onGenerate);
  dom.presetSelect?.addEventListener("change", (e) => handlers.onPresetChange?.(e.target.value));
  dom.key?.addEventListener("change", (e) => handlers.onKeyChange(e.target.value));
  dom.mode?.addEventListener("change", (e) => handlers.onModeChange && handlers.onModeChange(e.target.value));
  dom.styleSelect?.addEventListener("change", (e) => handlers.onStyleChange(e.target.value));
  dom.leftHand?.addEventListener("change", (e) => handlers.onLeftHandChange?.(e.target.value));
  dom.motif?.addEventListener("change", (e) => handlers.onMotifChange?.(e.target.value));
  dom.length?.addEventListener("change", (e) => handlers.onLengthChange?.(e.target.value));
  dom.tempoSlider?.addEventListener("input", (e) => handlers.onTempoChange(Number(e.target.value)));
  dom.stopAll?.addEventListener("click", handlers.onStopAll);
  dom.playAll?.addEventListener("click", handlers.onPlayAll);
  dom.progressionSelect?.addEventListener("change", (e) => handlers.onProgressionChange(e.target.value));

  dom.playButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget.dataset.target;
      if (!target) return;
      handlers.onPlay(target);
    });
  });

  dom.clearCustom?.addEventListener("click", handlers.onClearCustom);
  dom.mixCardToggle?.addEventListener("click", () => handlers.onMixCardToggle?.());
  dom.advancedControlsToggle?.addEventListener("click", () => handlers.onAdvancedControlsToggle?.());
  dom.assignmentReroll?.addEventListener("click", () => handlers.onAssignmentReroll?.());
  dom.assignmentUndo?.addEventListener("click", () => handlers.onAssignmentUndo?.());
  dom.assignmentRedo?.addEventListener("click", () => handlers.onAssignmentRedo?.());
  dom.assignmentLockButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      const component = button.dataset.assignmentLock;
      if (component) handlers.onAssignmentLockToggle?.(component);
    });
  });
  dom.pianoModel?.addEventListener("change", (e) => {
    const value = e.target.value;
    handlers.onLibrarySelect?.(value);
  });
  dom.pianoIndicatorRadios?.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      dom.__pianoIndicatorMode = radio.value;
      handlers.onPianoIndicatorModeChange?.(radio.value);
    });
  });
  dom.pianoGlissToggle?.addEventListener("change", (event) => {
    dom.__pianoGlissMode = event.target.checked;
    dom.pianoVisual?.classList.toggle("gliss-mode", event.target.checked);
    handlers.onPianoGlissModeChange?.(event.target.checked);
  });
  dom.pianoChordMode?.addEventListener("change", (event) => {
    handlers.onPianoChordModeChange?.(event.target.value);
  });

  wireLivePianoInteractions(dom, handlers);

  if (handlers.onMixChange || handlers.onMixMute) {
    MIX_PARTS.forEach((part) => {
      const controls = dom.mixControls?.[part];
      if (!controls) return;
      controls.volume?.addEventListener("input", (e) => {
        handlers.onMixChange?.(part, Number(e.target.value));
      });
      controls.mute?.addEventListener("change", (e) => {
        handlers.onMixMute?.(part, e.target.checked);
      });
    });
  }

  dom.humanizeToggle?.addEventListener("change", (e) => {
    handlers.onHumanizeToggle?.(e.target.checked);
  });
  dom.humanizeAmount?.addEventListener("input", (e) => {
    handlers.onHumanizeAmount?.(Number(e.target.value));
  });
  dom.swingAmount?.addEventListener("input", (e) => {
    handlers.onSwingAmount?.(Number(e.target.value));
  });
  dom.reverbWet?.addEventListener("input", (e) => {
    handlers.onReverbWetChange?.(Number(e.target.value));
  });
  dom.roomSizeToggle?.addEventListener("change", (e) => {
    handlers.onRoomSizeToggle?.(e.target.checked);
  });
  dom.motifWidth?.addEventListener("input", (e) => {
    handlers.onMotifWidthChange?.(Number(e.target.value));
  });
}

function wireLivePianoInteractions(dom, handlers) {
  if (!dom.pianoVisual || (!handlers.onPianoKeyDown && !handlers.onPianoKeyUp)) return;
  let activePointerId = null;
  let activePointerNote = null;
  let keyboardActivationNote = null;
  const activeComputerKeys = new Map();
  let qwertyOctaveShift = 0;
  renderQwertyHelp(dom, qwertyOctaveShift);

  const noteAtEvent = (event) => {
    let target = event.target;
    if (
      typeof document.elementFromPoint === "function" &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY)
    ) {
      target = document.elementFromPoint(event.clientX, event.clientY) || target;
    }
    return target?.closest?.(".piano-key")?.dataset?.note || null;
  };

  const pressPointerNote = (note) => {
    if (!note || note === activePointerNote) return;
    if (activePointerNote) handlers.onPianoKeyUp?.(activePointerNote, "pointer");
    activePointerNote = note;
    handlers.onPianoKeyDown?.(note, "pointer");
  };

  const releasePointerNote = () => {
    if (!activePointerNote) return;
    handlers.onPianoKeyUp?.(activePointerNote, "pointer");
    activePointerNote = null;
  };

  const finishPointer = (event) => {
    if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
    releasePointerNote();
    activePointerId = null;
  };

  dom.pianoVisual.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointerId = event.pointerId;
    if (dom.__pianoGlissMode) event.preventDefault();
    dom.pianoVisual.setPointerCapture?.(event.pointerId);
    pressPointerNote(noteAtEvent(event));
  });

  dom.pianoVisual.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId || !dom.__pianoGlissMode) return;
    event.preventDefault();
    const note = noteAtEvent(event);
    if (note) pressPointerNote(note);
    else releasePointerNote();
  });

  dom.pianoVisual.addEventListener("pointerup", finishPointer);
  dom.pianoVisual.addEventListener("pointercancel", finishPointer);
  dom.pianoVisual.addEventListener("lostpointercapture", finishPointer);

  const pianoKeysInPitchOrder = () =>
    [...dom.pianoVisual.querySelectorAll(".piano-key")].sort(
      (a, b) => noteStringToMidi(a.dataset.note) - noteStringToMidi(b.dataset.note),
    );

  const setRovingKey = (nextKey) => {
    if (!nextKey) return;
    pianoKeysInPitchOrder().forEach((key) => {
      key.tabIndex = key === nextKey ? 0 : -1;
    });
    nextKey.focus();
  };

  dom.pianoVisual.addEventListener("focusin", (event) => {
    const key = event.target.closest?.(".piano-key");
    if (key) setRovingKey(key);
  });

  dom.pianoVisual.addEventListener("keydown", (event) => {
    const key = event.target.closest?.(".piano-key");
    if (!key) return;

    const keys = pianoKeysInPitchOrder();
    const index = keys.indexOf(key);
    const focusMoves = {
      ArrowLeft: keys[Math.max(0, index - 1)],
      ArrowDown: keys[Math.max(0, index - 1)],
      ArrowRight: keys[Math.min(keys.length - 1, index + 1)],
      ArrowUp: keys[Math.min(keys.length - 1, index + 1)],
      Home: keys[0],
      End: keys.at(-1),
    };

    if (focusMoves[event.key]) {
      event.preventDefault();
      setRovingKey(focusMoves[event.key]);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && !event.repeat && !keyboardActivationNote) {
      event.preventDefault();
      keyboardActivationNote = key.dataset.note;
      handlers.onPianoKeyDown?.(keyboardActivationNote, "screenKey");
    }
  });

  dom.pianoVisual.addEventListener("keyup", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (keyboardActivationNote) handlers.onPianoKeyUp?.(keyboardActivationNote, "screenKey");
    keyboardActivationNote = null;
  });

  const isFormControl = (target) =>
    !!target?.closest?.("input, select, textarea, button, [contenteditable='true']");

  const releaseComputerKeys = () => {
    activeComputerKeys.forEach((note) => handlers.onPianoKeyUp?.(note, "computerKeyboard"));
    activeComputerKeys.clear();
  };

  window.addEventListener("keydown", (event) => {
    if (
      !dom.__pianoComputerKeyboardEnabled ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    if (isFormControl(event.target)) return;
    const key = event.key.toLowerCase();
    const shift = QWERTY_OCTAVE_KEYS[key];
    if (shift) {
      event.preventDefault();
      const next = clampQwertyOctaveShift(qwertyOctaveShift + shift);
      if (next === qwertyOctaveShift) return;
      // Release what is held first so no key is left sounding at the old octave.
      releaseComputerKeys();
      qwertyOctaveShift = next;
      renderQwertyHelp(dom, qwertyOctaveShift);
      return;
    }
    const baseNote = QWERTY_PIANO_NOTES[key];
    if (!baseNote || activeComputerKeys.has(key)) return;
    const note = transposeOctaves(baseNote, qwertyOctaveShift);
    event.preventDefault();
    activeComputerKeys.set(key, note);
    handlers.onPianoKeyDown?.(note, "computerKeyboard");
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    const note = activeComputerKeys.get(key);
    if (!note) return;
    event.preventDefault();
    activeComputerKeys.delete(key);
    handlers.onPianoKeyUp?.(note, "computerKeyboard");
  });

  window.addEventListener("blur", () => {
    finishPointer();
    if (keyboardActivationNote) handlers.onPianoKeyUp?.(keyboardActivationNote, "screenKey");
    keyboardActivationNote = null;
    releaseComputerKeys();
  });

  dom.pianoGlissToggle?.addEventListener("change", (event) => {
    if (!event.target.checked) finishPointer();
  });

  dom.pianoComputerKeyboardToggle?.addEventListener("change", (event) => {
    dom.__pianoComputerKeyboardEnabled = event.target.checked;
    if (!event.target.checked) releaseComputerKeys();
    handlers.onPianoComputerKeyboardChange?.(event.target.checked);
  });
}

export function renderPlaceholders(dom) {
  if (!dom) return;
  dom.scaleName.textContent = "--";
  dom.scaleNotes.textContent = "Select options and generate to begin.";
  dom.progressionRoman.textContent = "--";
  dom.progressionChords.textContent = "--";
  if (dom.progressionDescription) dom.progressionDescription.textContent = "Select a progression preset.";
  dom.progressionVisual.innerHTML = "";
  dom.lhName.textContent = "--";
  dom.lhDetails.innerHTML = "";
  dom.motifRhythm.textContent = "--";
  dom.motifPitches.textContent = "--";
  dom.motifVisual.innerHTML = "";
}

export function renderScale(state, dom) {
  if (!state.derived.scale) return;
  dom.scaleName.textContent = state.derived.scale.name;
  if (!dom.scaleNotes) return;
  const notes = state.derived.scale.notes || [];
  dom.scaleNotes.innerHTML = notes
    .map((note) => `<span class="scale-note" data-note-label="${note}">${note}</span>`)
    .join('<span class="scale-note-sep">|</span>');
}

export function renderProgression(state, dom, getPreset) {
  if (!state.derived.progression) return;
  const { roman, bars } = state.derived.progression;
  const mode = state.inputs?.mode || state.derived.scale?.mode;

  const romanLabeled = roman.map((symbol) => {
    const parsed = parseRomanSymbol(symbol);
    const tag = getChordTagForSymbol(symbol, {
      mode,
      parsed,
      preferModeQuality: true,
      styleProfile: state.derived.styleProfile,
      applyStyleOverrides: true,
    });
    return labelRomanWithTag(symbol, tag, parsed);
  });
  dom.progressionRoman.textContent = romanLabeled.join(" - ");

  dom.progressionChords.textContent = bars.map((bar) => bar.label).join(" | ");

  const preset = getPreset(state.inputs.progressionPresetId);
  if (dom.progressionDescription) {
    dom.progressionDescription.textContent =
      preset && preset.id !== "custom" ? preset.description : "Custom progression";
  }

  dom.progressionVisual.innerHTML = bars
    .map((bar, idx) => {
      const borrowed = bar?.isDiatonic === false;
      const reason = borrowed ? escapeHtmlAttr(getBorrowedReasonLabel(bar?.diatonicReason)) : "";
      const borrowedClass = borrowed ? " borrowed" : "";
      const titleAttr = borrowed && reason ? ` title="${reason}"` : "";
      return `<div class="bar progression-bar${borrowedClass}" data-bar-index="${idx}"${titleAttr}>${idx + 1}. ${bar.label}</div>`;
    })
    .join("");
}

export function renderCustomProgressionPreview(state, dom) {
  if (!dom.customPreview) return;
  const mode = state.inputs?.mode || state.derived.scale?.mode;
  if (!state.inputs.customProgressionRoman.length) {
    dom.customPreview.textContent = "No chords yet. Click palette buttons to build your sequence.";
  } else {
    const labels = state.inputs.customProgressionRoman.map((chord) => {
      const parsed = parseRomanSymbol(chord);
      const tag = getChordTagForSymbol(chord, {
        mode,
        parsed,
        preferModeQuality: true,
        styleProfile: state.derived.styleProfile,
        applyStyleOverrides: true,
      });
      return labelRomanWithTag(chord, tag, parsed);
    });

    dom.customPreview.textContent = labels.join(" | ");
  }
}

export function renderLeftHand(state, dom) {
  if (!state.derived.leftHand) return;
  dom.lhName.textContent = state.derived.leftHand.name;
  dom.lhDetails.innerHTML = state.derived.leftHand.bars
    .map(
      (bar, idx) => `
        <div class="row lh-row" data-bar-index="${idx}">
          <span>${bar.title}</span>
          <span>${bar.description}</span>
        </div>
      `,
    )
    .join("");
}

export function renderMotif(state, dom) {
  const motif = state.derived.motif;
  if (!motif) {
    dom.motifRhythm.textContent = "No motif selected.";
    dom.motifPitches.textContent = "--";
    if (dom.motifVisual) dom.motifVisual.innerHTML = "";
    dom.motifPlayhead = null;
    return;
  }

  dom.motifRhythm.textContent = `Style: ${motif.description} | Rhythm: ${motif.rhythmLabels.join(", ")}`;
  dom.motifPitches.textContent = `Pitches: ${motif.degreeLabels.join(" - ")} -> ${motif.noteLabels.join(" - ")}`;
  drawMotifContour(motif, dom);
}

export function drawMotifContour(motif, dom) {
  const svg = dom.motifVisual;
  svg.innerHTML = "";
  dom.motifPlayhead = null;
  if (!motif || !motif.steps?.length) return;

  const noteSteps = motif.steps.filter((step) => !step.rest && typeof step.degree !== "undefined");
  if (!noteSteps.length) return;

  const width = 200;
  const height = 120;
  const verticalPadding = 12;
  const totalBeats =
    motif.totalBeats || noteSteps[noteSteps.length - 1].time + (noteSteps[noteSteps.length - 1].beats || 0);
  const degreeValues = noteSteps.map((step) => getDegreeValue(step.degree));
  const maxDegree = Math.max(...degreeValues);
  const minDegree = Math.min(...degreeValues);
  const range = maxDegree === minDegree ? 1 : maxDegree - minDegree;

  const points = noteSteps
    .map((step, idx) => {
      const degreeValue = degreeValues[idx];
      const midpointBeat = step.time + (step.beats || 0) / 2;
      const normalizedTime = totalBeats ? Math.min(1, Math.max(0, midpointBeat / totalBeats)) : 0;
      const x = normalizedTime * width;
      const normalizedDegree = (degreeValue - minDegree) / range;
      const y = height - normalizedDegree * (height - 2 * verticalPadding) - verticalPadding;
      return `${x},${y}`;
    })
    .join(" ");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#9c6c51");
  polyline.setAttribute("stroke-width", "3");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.appendChild(polyline);

  const playhead = document.createElementNS("http://www.w3.org/2000/svg", "line");
  playhead.setAttribute("x1", 0);
  playhead.setAttribute("x2", 0);
  playhead.setAttribute("y1", 0);
  playhead.setAttribute("y2", height);
  playhead.classList.add("playhead-line", "motif-playhead-line");
  svg.appendChild(playhead);
  dom.motifPlayhead = playhead;
  updateMotifPlayhead(dom, null);
}

function getDegreeValue(degree) {
  if (typeof degree === "number" && Number.isFinite(degree)) {
    return degree;
  }
  const parsed = parseInt(String(degree ?? "1").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

export function renderPianoRoll(state, dom) {
  const svg = dom.pianoRoll || document.getElementById("piano-roll");
  const score = state.derived.score;
  if (!svg || !score) return;

  svg.innerHTML = "";

  // Score is now the single event source for both parts. The legacy renderer
  // shifted some left-hand notes down an octave for display only, so the roll
  // could disagree with what playback actually sounded. Render the true MIDI
  // pitches and reserve presentation transforms for geometry alone.
  const events = [
    ...score.parts.lh
      .filter((event) => event.kind === "note")
      .map((event) => ({
        id: event.id,
        track: "lh",
        start: event.startBeat,
        end: Math.min(event.startBeat + event.durationBeats, score.meta.totalBeats),
        midi: event.midi,
        label: stripOctave(midiToNote(event.midi)),
      })),
    ...score.parts.rh.map((event) =>
      event.kind === "rest"
        ? {
            id: event.id,
            track: "motif-rest",
            start: event.startBeat,
            end: Math.min(event.startBeat + event.durationBeats, score.meta.totalBeats),
          }
        : {
            id: event.id,
            track: "motif",
            start: event.startBeat,
            end: Math.min(event.startBeat + event.durationBeats, score.meta.totalBeats),
            midi: event.midi,
            label: stripOctave(midiToNote(event.midi)),
          },
    ),
  ].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  if (!events.length) return;

  const minBeat = 0;
  const maxBeat = Math.max(score.meta.totalBeats, 1);

  const minMidi = 36;
  const maxMidi = 84;
  const midiSpan = maxMidi - minMidi || 1;

  const restMidi = 65;

  const beatSpan = Math.max(maxBeat - minBeat, 1);

  const width = 800;
  const height = 200;
  const verticalPadding = 10;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const beatToX = (beat) => ((beat - minBeat) / beatSpan) * width;

  const midiToY = (midi) => {
    const totalHeight = height - 2 * verticalPadding;
    const clamped = Math.min(maxMidi, Math.max(minMidi, midi));
    const normalized = (clamped - minMidi) / midiSpan;
    return height - normalized * totalHeight - verticalPadding;
  };

  const totalBars = score.meta.bars;

  for (let b = 0; b <= totalBars; b++) {
    const x = beatToX(minBeat + b * 4);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", 0);
    line.setAttribute("x2", x);
    line.setAttribute("y2", height);
    line.setAttribute("stroke", b === 0 ? "#555" : "#777");
    line.setAttribute("stroke-width", b === 0 ? "1.5" : "1");
    line.setAttribute("stroke-dasharray", b === 0 ? "0" : "4 4");
    svg.appendChild(line);
  }

  const NS = "http://www.w3.org/2000/svg";

  events.forEach((e) => {
    const x = beatToX(e.start);
    const xEnd = beatToX(e.end);
    const w = Math.max(4, xEnd - x);
    const y = midiToY(e.track === "motif-rest" ? restMidi : e.midi);

    const rect = document.createElementNS(NS, "rect");

    let rectHeight = 12;
    let rectWidth = w;
    let rectX = x;
    let fill = "#222";

    if (e.track === "lh") {
      fill = "#8cb4ff";
    } else if (e.track === "motif") {
      fill = "#f7a76c";
    } else if (e.track === "motif-rest") {
      fill = "#b0b0b0";
      rectHeight = 16;
      rectWidth = Math.max(4, w * 0.5);
      rectX = x + (w - rectWidth) / 2;
    }

    rect.setAttribute("x", rectX);
    rect.setAttribute("y", y - rectHeight / 2);
    rect.setAttribute("width", rectWidth);
    rect.setAttribute("height", rectHeight);
    rect.setAttribute("rx", 3);
    rect.setAttribute("ry", 3);
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", "#222");
    rect.setAttribute("stroke-width", "0.5");
    rect.setAttribute("data-event-id", e.id);
    rect.setAttribute("data-track", e.track);
    if (Number.isInteger(e.midi)) rect.setAttribute("data-midi", String(e.midi));
    svg.appendChild(rect);

    if (e.track !== "motif-rest") {
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", x + w / 2);
      text.setAttribute("y", y);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("font-size", "8");
      text.setAttribute("fill", "#111");
      text.textContent = e.label;
      svg.appendChild(text);
    }
  });

  const playhead = document.createElementNS(NS, "line");
  playhead.setAttribute("id", "piano-roll-playhead");
  playhead.setAttribute("x1", 0);
  playhead.setAttribute("x2", 0);
  playhead.setAttribute("y1", 0);
  playhead.setAttribute("y2", height);
  playhead.classList.add("playhead-line");
  svg.appendChild(playhead);
  dom.pianoRollPlayhead = playhead;
  updatePianoRollPlayhead(dom, null);
}

export function renderMixControls(dom, mixState) {
  if (!dom.mixControls || !mixState) return;
  MIX_PARTS.forEach((part) => {
    const controls = dom.mixControls[part];
    const settings = mixState[part];
    if (!controls || !settings) return;
    if (controls.volume && typeof settings.volume === "number") {
      controls.volume.value = settings.volume;
      if (controls.volumeLabel) {
        controls.volumeLabel.textContent = formatDb(settings.volume, settings.mute);
      }
    }
    if (controls.mute) {
      controls.mute.checked = !!settings.mute;
    }
  });
}

export function renderHumanizeControls(dom, playback) {
  if (!playback) return;
  const enabled = !!playback.humanizeEnabled;
  if (dom.humanizeToggle) dom.humanizeToggle.checked = enabled;
  const amountPercent = Math.round((playback.humanizeAmount || 0) * 100);
  const swingPercent = Math.round((playback.swingAmount || 0) * 100);
  if (dom.humanizeAmount) {
    dom.humanizeAmount.value = amountPercent;
    dom.humanizeAmount.disabled = !enabled;
  }
  if (dom.swingAmount) {
    dom.swingAmount.value = swingPercent;
    dom.swingAmount.disabled = !enabled;
  }
  if (dom.humanizeValue) dom.humanizeValue.textContent = `${amountPercent}%`;
  if (dom.swingValue) dom.swingValue.textContent = `${swingPercent}%`;
}

export function renderSpatialControls(dom, fx = {}) {
  if (dom.reverbWet) {
    const wetPercent = Math.round((fx.reverbWet ?? 0) * 100);
    dom.reverbWet.value = Math.min(60, wetPercent);
    if (dom.reverbWetValue) dom.reverbWetValue.textContent = `${wetPercent}%`;
  }
  if (dom.roomSizeToggle) {
    dom.roomSizeToggle.checked = !!fx.roomSizeLarge;
  }
  if (dom.motifWidth) {
    const widthPercent = Math.round((fx.motifWidth ?? 0) * 100);
    dom.motifWidth.value = widthPercent;
    if (dom.motifWidthValue) dom.motifWidthValue.textContent = `${widthPercent}%`;
  }
}

export function renderAssignmentTools(dom, state, history = {}) {
  const locks = state?.locks || {};
  dom.assignmentLockButtons?.forEach((button) => {
    const component = button.dataset.assignmentLock;
    if (!component) return;
    const locked = !!locks[component];
    const label = component.charAt(0).toUpperCase() + component.slice(1);
    button.setAttribute("aria-pressed", String(locked));
    button.classList.toggle("active", locked);
    button.textContent = `${locked ? "Unlock" : "Lock"} ${label.toLowerCase()}`;
    button.title = `${label} is ${locked ? "kept" : "eligible to change"} on the next reroll`;
  });

  if (dom.assignmentReroll) {
    const allLocked = ["key", "harmony", "groove", "motif"].every((part) => !!locks[part]);
    dom.assignmentReroll.disabled = allLocked || !state?.assignment;
    dom.assignmentReroll.title = allLocked
      ? "Unlock at least one part to create a variation"
      : "Create the next deterministic variation";
  }
  if (dom.assignmentUndo) dom.assignmentUndo.disabled = !history.canUndo;
  if (dom.assignmentRedo) dom.assignmentRedo.disabled = !history.canRedo;
  if (dom.assignmentSeed) dom.assignmentSeed.textContent = state?.assignment?.seed || "—";
  if (dom.assignmentId) {
    const id = state?.assignment?.id || "";
    dom.assignmentId.textContent = id ? `ID ${id.replace(/^assignment-/, "")}` : "";
  }
}

export function setMixCardCollapsed(dom, collapsed) {
  if (dom.mixCard) {
    dom.mixCard.classList.toggle("collapsed", !!collapsed);
  }
  if (dom.mixCardToggle) {
    dom.mixCardToggle.textContent = collapsed ? "Show" : "Hide";
    dom.mixCardToggle.setAttribute("aria-expanded", String(!collapsed));
  }
}

export function setAdvancedControlsCollapsed(dom, collapsed) {
  if (dom.advancedControlsCard) {
    dom.advancedControlsCard.classList.toggle("collapsed", !!collapsed);
  }
  if (dom.advancedControlsToggle) {
    dom.advancedControlsToggle.textContent = collapsed ? "Show Controls" : "Hide Controls";
    dom.advancedControlsToggle.setAttribute("aria-expanded", String(!collapsed));
  }
}

export function populatePresetSelector(dom, presets = [], selectedId) {
  if (!dom?.presetSelect) return;
  dom.presetSelect.innerHTML = [
    '<option value="" disabled>Custom variation</option>',
    ...presets.map((preset) => `<option value="${preset.id}">${preset.name}</option>`),
  ].join("");
  const resolvedId = selectedId || presets[0]?.id || "";
  if (resolvedId) {
    dom.presetSelect.value = resolvedId;
  }
}

export function renderSamplerStatus(dom, snapshot = {}) {
  const badge = dom.samplerStatus || null;
  const libraries = Object.values(snapshot?.libraries || {});
  if (badge) {
    badge.classList.remove("loading", "ready", "error");
    badge.innerHTML = "";
  }

  if (!libraries.length) {
    if (badge) {
      badge.textContent = "Loading piano…";
      badge.classList.add("loading");
    }
    syncPianoModelSelector(dom.pianoModel, [], snapshot.activeLibraryId);
    return;
  }

  const sorted = [...libraries].sort((a, b) => {
    if (a.isDefault === b.isDefault) return a.label.localeCompare(b.label);
    return a.isDefault ? -1 : 1;
  });

  if (badge) {
    sorted.forEach((entry) => {
      const row = document.createElement("span");
      row.classList.add("sampler-row", entry.phase || "idle");
      row.textContent = formatSamplerRow(entry, snapshot.activeLibraryId);
      badge.appendChild(row);
    });

    const badgeClass = deriveBadgeClass(sorted);
    if (badgeClass) badge.classList.add(badgeClass);
  }
  syncPianoModelSelector(dom.pianoModel, sorted, snapshot.activeLibraryId);
}

function formatSamplerRow(entry, activeId) {
  const activeSuffix = entry.active || entry.libraryId === activeId ? " (active)" : "";
  switch (entry.phase) {
    case "ready":
      return `${entry.label} · Ready${activeSuffix}`.trim();
    case "progress":
    case "init":
    case "switching": {
      const pct = typeof entry.progress === "number" ? `${Math.round(entry.progress * 100)}%` : "";
      return `${entry.label} · Loading${pct ? ` ${pct}` : ""}`;
    }
    case "timeout":
      return `${entry.label} · Timeout – reselect to retry`;
    case "error":
      return `${entry.label} · Error – ${entry.error || "check connection"}`;
    case "standby":
      return `${entry.label} · Pick from menu to load`;
    case "idle":
    default:
      return `${entry.label} · ${entry.phase === "idle" ? "Warming up" : entry.phase || "Idle"}`;
  }
}

function deriveBadgeClass(entries) {
  if (entries.some((entry) => entry.phase === "error" || entry.phase === "timeout")) {
    return "error";
  }
  const defaultEntry = entries.find((entry) => entry.isDefault);
  if (defaultEntry?.phase === "ready") {
    return "ready";
  }
  return "loading";
}

function syncPianoModelSelector(selectEl, libraries, activeId) {
  if (!selectEl) return;
  if (!libraries.length) {
    selectEl.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Loading models…";
    selectEl.appendChild(placeholder);
    selectEl.disabled = true;
    return;
  }

  const locked = selectEl.dataset.locked === "true";
  const previousValue = selectEl.value;
  selectEl.innerHTML = "";
  libraries.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.libraryId;
    let label = entry.label || entry.libraryId;
    if (entry.isDefault) label = `${label} (Default)`;
    if (entry.phase === "error") {
      label = `${label} · Error`;
    } else if (["progress", "init", "switching"].includes(entry.phase)) {
      label = `${label} · Loading`;
    }
    option.textContent = label;
    selectEl.appendChild(option);
  });

  const hasActive = libraries.some((entry) => entry.libraryId === activeId);
  const hasPrevious = libraries.some((entry) => entry.libraryId === previousValue);
  const previousIsPending = libraries.some(
    (entry) => entry.libraryId === previousValue && entry.phase !== "ready",
  );
  const nextValue =
    locked && hasPrevious
      ? previousValue
      : previousIsPending
        ? previousValue
        : hasActive
          ? activeId
          : hasPrevious
            ? previousValue
            : libraries[0].libraryId;
  selectEl.value = nextValue;
  selectEl.disabled = locked;
}

function formatDb(value, muted) {
  if (muted) return "Muted";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded} dB`;
}

export function populateMotifSelector(dom, motifs) {
  const select = dom.motif;
  if (!select) return;

  select.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "none";
  noneOption.textContent = "No Motif (chords + LH only)";
  select.appendChild(noneOption);

  const grouped = {};
  Object.entries(motifs).forEach(([id, style]) => {
    if (!grouped[style.category]) grouped[style.category] = [];
    grouped[style.category].push({ id, ...style });
  });

  Object.keys(grouped).forEach((category) => {
    const groupEl = document.createElement("optgroup");
    groupEl.label = category.charAt(0).toUpperCase() + category.slice(1);
    grouped[category].forEach((style) => {
      const option = document.createElement("option");
      option.value = style.id;
      option.textContent = `${style.label} (${style.difficulty})`;
      groupEl.appendChild(option);
    });
    select.appendChild(groupEl);
  });

  if (select.options.length > 0 && select.selectedIndex === -1) {
    select.selectedIndex = 0;
  }
}

export function toggleCustomCard(dom, isCustom) {
  const card = document.getElementById("custom-progression-card");
  if (!card) return;
  if (isCustom) {
    card.classList.remove("hidden");
  } else {
    card.classList.add("hidden");
  }
}

export function renderProgressionPresetInfo(dom, preset, styleProfile, progression) {
  if (!dom.progressionDescription) return;
  const styleText = styleProfile ? `Style: ${styleProfile.label} - ${styleProfile.description}` : "";
  const baseText =
    preset && preset.id !== "custom"
      ? `${preset.description}${styleText ? ` | ${styleText}` : ""}`
      : styleText || "Custom progression";
  const borrowedSummary = summarizeBorrowedChords(progression);
  dom.progressionDescription.textContent = borrowedSummary ? `${baseText} | ${borrowedSummary}` : baseText;
}

export function populateProgressionSelector(dom, presets, activeId) {
  const select = dom.progressionSelect;
  if (!select) return;
  const ownerDocument = select.ownerDocument || document;

  select.innerHTML = "";

  presets.forEach((preset) => {
    const option = ownerDocument.createElement("option");
    option.value = preset.id;
    const romanText = preset.roman.join(" – ");
    option.textContent = `${preset.label} (${romanText})`;
    select.appendChild(option);
  });

  const customOption = ownerDocument.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Custom (use chord palette)";
  select.appendChild(customOption);

  const resolvedId = activeId || presets[0]?.id || "custom";
  select.value = resolvedId;
  if (select.value !== resolvedId && select.options.length > 0) {
    select.selectedIndex = 0;
  }
}

export function renderPaletteButtons(styleId, dom, paletteSets, options = {}) {
  const container = dom.paletteContainer;
  if (!container) return;
  container.innerHTML = "";

  const groups =
    CUSTOM_PALETTE_LIBRARY[styleId] ||
    paletteSets?.[styleId] ||
    CUSTOM_PALETTE_LIBRARY.classical ||
    paletteSets?.classical ||
    [];
  const mode = options.mode;

  groups.forEach((group) => {
    const wrapper = document.createElement("div");
    wrapper.className = "palette-group";

    const labelEl = document.createElement("div");
    labelEl.className = "palette-label";
    labelEl.textContent = group.label;
    wrapper.appendChild(labelEl);

    const row = document.createElement("div");
    row.className = "chord-palette-row";

    group.chords.forEach((chord) => {
      const parsed = parseRomanSymbol(chord);
      const tag = getChordTagForSymbol(chord, {
        mode,
        parsed,
        preferModeQuality: true,
        styleProfile: options.styleProfile,
        applyStyleOverrides: true,
      });
      const labelText = labelRomanWithTag(chord, tag, parsed);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chord-button";
      btn.dataset.chord = chord;
      btn.textContent = labelText;
      row.appendChild(btn);
    });

    wrapper.appendChild(row);
    container.appendChild(wrapper);
  });

  if (!container.children.length) {
    const row = document.createElement("div");
    row.className = "chord-palette-row";
    ["I", "ii", "iii", "IV", "V", "vi", "viio"].forEach((chord) => {
      const parsed = parseRomanSymbol(chord);
      const tag = getChordTagForSymbol(chord, {
        mode,
        parsed,
        preferModeQuality: true,
        styleProfile: options.styleProfile,
        applyStyleOverrides: true,
      });
      const labelText = labelRomanWithTag(chord, tag, parsed);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chord-button";
      btn.dataset.chord = chord;
      btn.textContent = labelText;
      row.appendChild(btn);
    });
    container.appendChild(row);
  }
}

export function attachPaletteButtonHandlers(dom, onChordAdd) {
  if (!dom.paletteContainer) return;
  const buttons = dom.paletteContainer.querySelectorAll(".chord-button");
  buttons.forEach((btn) => {
    btn.onclick = () => {
      const chord = btn.dataset.chord;
      if (!chord) return;
      onChordAdd(chord);
      pulseElement(btn, "tap");
      if (dom.customPreview) pulseElement(dom.customPreview, "status");
      if (dom.customHeader) pulseElement(dom.customHeader, "accent");
    };
  });
}

export function setTempoValue(dom, value) {
  if (dom.tempoValue) dom.tempoValue.textContent = `${value} BPM`;
}

export function updateGenerateButtonLabel(dom, isCustom) {
  if (!dom.generate) return;
  dom.generate.textContent = isCustom ? "Generate from Custom Chords" : "Generate Assignment";
}

export function updateCustomHeaderCount(dom, count) {
  if (!dom.customHeader) return;
  const bars = count || 0;
  dom.customHeader.textContent = `Custom Progression (${bars} bar${bars === 1 ? "" : "s"})`;
}

export function setStatusMessage(dom, text, options = {}) {
  if (!dom.statusLine) return;
  const node = dom.statusLine;
  const {
    tone = STATUS_DEFAULT_TONE,
    transient = false,
    duration = STATUS_TRANSIENT_MS,
    pulse = true,
    ambient = false,
  } = options;
  if (!transient) {
    lastPersistentStatus = text;
    // This is a single last-writer-wins channel shared by two kinds of message:
    // responses to something the user just did, and ambient background status
    // such as sample loading finishing. Ambient status arrives asynchronously and
    // used to wipe an actionable hint mid-read ("Add at least one chord"), so it
    // now waits: it is already recorded as the message to restore when the hint
    // expires. Anything the user actually triggered still takes effect at once.
    if (ambient && statusResetTimer) return;
  }

  node.textContent = text;
  node.dataset.tone = tone;
  node.dataset.transient = transient ? "true" : "false";

  if (statusResetTimer) {
    clearScheduledTimeout(statusResetTimer);
    statusResetTimer = null;
  }

  if (transient) {
    const timeoutDuration = Number.isFinite(duration) ? duration : STATUS_TRANSIENT_MS;
    statusResetTimer = scheduleTimeout(() => {
      statusResetTimer = null;
      node.dataset.tone = STATUS_DEFAULT_TONE;
      node.dataset.transient = "false";
      node.textContent = lastPersistentStatus || "";
    }, timeoutDuration);
  }

  if (pulse) {
    const variant = tone === "error" ? "alert" : tone === "success" ? "accent" : "status";
    pulseElement(node, variant);
  }
}

export function setPlayButtonsEnabled(dom, enabled) {
  const toggles = [dom.playAll, dom.stopAll, ...(dom.playButtons ? Array.from(dom.playButtons) : [])];
  toggles.forEach((btn) => {
    if (btn) btn.disabled = !enabled;
  });
}

export function updateLoopBadge(dom, enabled) {
  if (!dom.playAllLoopBadge) return;
  const badge = dom.playAllLoopBadge;
  const stateValue = enabled ? "on" : "off";
  badge.textContent = enabled ? "Looping" : "Not looping";
  badge.classList.toggle("active", enabled);
  badge.classList.toggle("inactive", !enabled);
  if (badge.dataset.state !== stateValue) {
    pulseElement(badge, "badge");
  }
  badge.dataset.state = stateValue;
}

export function highlightScaleNote(dom, noteLabel) {
  const container = dom.scaleNotes;
  if (!container) return;
  const normalized = noteLabel ? String(noteLabel).replace(/[0-9]/g, "").toUpperCase() : "";
  const nodes = container.querySelectorAll(".scale-note");
  nodes.forEach((node) => {
    const label = node.dataset.noteLabel ? node.dataset.noteLabel.toUpperCase() : "";
    node.classList.toggle("active", normalized && label === normalized);
  });
}

export function updatePianoRollPlayhead(dom, ratio) {
  const line = dom.pianoRollPlayhead;
  const svg = dom.pianoRoll || document.getElementById("piano-roll");
  if (!line || !svg) return;
  if (ratio == null || Number.isNaN(ratio)) {
    line.classList.remove("active");
    return;
  }
  const viewBox = svg.viewBox?.baseVal;
  const width = viewBox?.width || svg.clientWidth || 0;
  const height = viewBox?.height || svg.clientHeight || 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const x = width * clamped;
  line.setAttribute("x1", x);
  line.setAttribute("x2", x);
  line.setAttribute("y1", 0);
  line.setAttribute("y2", height || 160);
  line.classList.add("active");
}

export function updateMotifPlayhead(dom, ratio) {
  const line = dom.motifPlayhead;
  const svg = dom.motifVisual;
  if (!line || !svg) return;
  if (ratio == null || Number.isNaN(ratio)) {
    line.classList.remove("active");
    return;
  }
  const viewBox = svg.viewBox?.baseVal;
  const width = viewBox?.width || svg.clientWidth || 0;
  const height = viewBox?.height || svg.clientHeight || 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const x = width * clamped;
  line.setAttribute("x1", x);
  line.setAttribute("x2", x);
  line.setAttribute("y1", 0);
  line.setAttribute("y2", height || 120);
  line.classList.add("active");
}

export function highlightProgressionBar(dom, index) {
  const bars = dom.progressionVisual?.querySelectorAll(".progression-bar") || [];
  const isValid = typeof index === "number" && index >= 0;
  bars.forEach((bar, idx) => {
    bar.classList.toggle("active", isValid && idx === index);
  });
}

export function highlightLeftHandBar(dom, index) {
  const rows = dom.lhDetails?.querySelectorAll(".lh-row") || [];
  const isValid = typeof index === "number" && index >= 0;
  rows.forEach((row, idx) => {
    row.classList.toggle("active", isValid && idx === index);
  });
  if (dom.leftHandCard) {
    dom.leftHandCard.classList.toggle("playing", isValid);
  }
}

export function highlightMotifCard(dom, index) {
  if (!dom.motifCard) return;
  const isValid = typeof index === "number" && index >= 0;
  dom.motifCard.classList.toggle("playing", isValid);
}

export function resetPlaybackIndicators(dom) {
  updatePianoRollPlayhead(dom, null);
  updateMotifPlayhead(dom, null);
  highlightProgressionBar(dom, null);
  highlightLeftHandBar(dom, null);
  highlightMotifCard(dom, null);
  highlightScaleNote(dom, null);
}

export function runAssignmentPulse(dom, { includeMotif = true } = {}) {
  const targets = [findCardNode(dom.scaleNotes), findCardNode(dom.progressionVisual), dom.leftHandCard];
  if (includeMotif) {
    targets.push(dom.motifCard);
  }
  targets.filter(Boolean).forEach((node) => pulseElement(node, "card"));
}

export function pulsePresetCard(dom) {
  const fallbackCard = typeof document !== "undefined" ? document.getElementById("preset-card") : null;
  const presetCard = findCardNode(dom.presetSelect) || fallbackCard;
  if (presetCard) {
    pulseElement(presetCard, "card");
  }
  if (dom.advancedControlsCard && !dom.advancedControlsCard.classList.contains("collapsed")) {
    pulseElement(dom.advancedControlsCard, "card");
  }
}

export function pulseSamplerBadge(dom) {
  if (dom.samplerStatus) {
    pulseElement(dom.samplerStatus, "badge");
  }
}

export function showHint(dom, message, options = {}) {
  setStatusMessage(dom, message, {
    tone: "hint",
    transient: true,
    ...options,
  });
}

export function pulseElement(element, variant = "soft") {
  if (!element) return;
  const className = FEEDBACK_CLASS_MAP[variant] || FEEDBACK_CLASS_MAP.soft;
  const duration = FEEDBACK_DURATION_MAP[variant] || 600;
  if (feedbackTimers.has(element)) {
    clearScheduledTimeout(feedbackTimers.get(element));
    feedbackTimers.delete(element);
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  const timeoutId = scheduleTimeout(() => {
    element.classList.remove(className);
    feedbackTimers.delete(element);
  }, duration);
  feedbackTimers.set(element, timeoutId);
}

function findCardNode(element) {
  if (!element || typeof element.closest !== "function") return null;
  return element.closest(".card");
}

function summarizeBorrowedChords(progression) {
  if (!progression?.bars?.length) return "";
  const reasons = new Set();
  progression.bars.forEach((bar) => {
    if (bar && bar.isDiatonic === false) {
      reasons.add(bar.diatonicReason || "other");
    }
  });
  if (!reasons.size) return "";
  const summary = Array.from(reasons)
    .map((code) => getBorrowedReasonLabel(code))
    .join(", ");
  return `Borrowed: ${summary}`;
}

function escapeHtmlAttr(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getBorrowedReasonLabel(code) {
  switch (code) {
    case "secondary":
      return "Secondary Movement";
    case "accidental":
      return "Chromatic Alterations";
    case "quality":
      return "Altered Qualities";
    case "undefined":
      return "Outside Mode";
    default:
      return "Borrowed Harmony";
  }
}
