import {
  PROGRESSION_PRESETS,
  STYLE_PALETTE_SETS,
  MOTIF_STYLES,
  getProgressionPreset,
  getStyleProfile,
  midiToNote,
  noteStringToMidi,
} from "./theory.js";
import "./style.css";

import { generateAssignment, validateAssignmentInputs } from "./domain/assignment.js";
import { getLivePianoChordNotes } from "./domain/live-piano.js";
import { createAppStore } from "./application/state.js";
import { createAudioUnlock } from "./application/audio-unlock.js";
import {
  attachPianoNoteListeners,
  buildPianoVisual,
  clearPianoHighlights,
  renderPianoDiatonic,
} from "./components/piano.js";
import { PRESET_CONFIGS, DEFAULT_PRESET_ID, getPresetConfig } from "./presets.js";
import { mountCoach } from "./coach/mount.tsx";
import { createNoteInputHub } from "./input/note-input.ts";
import { createMidiInput } from "./input/midi.ts";
import { EMPTY_HELD_NOTES, playedNotes, reduceHeldNotes, soundingChanges } from "./input/held-notes.ts";
import {
  isPianoLoaded,
  audioEngine,
  startAudioContext,
  getTransportSnapshot,
  stopTransport,
  playScale,
  playPreviewNoteDown,
  playPreviewNoteUp,
  configureLoop,
  setMixSettings,
  setHumanizeSettings,
  setReverbWet,
  setRoomSize,
  setMotifWidth,
  onSamplerStatus,
  requestFallbackPianoLoad,
  requestLibraryLoad,
  getSamplerStatusSnapshot,
} from "./audio.js";
import {
  cacheDom,
  wireEvents,
  renderPlaceholders,
  renderScale,
  renderProgression,
  renderCustomProgressionPreview,
  renderLeftHand,
  renderMotif,
  renderPianoRoll,
  populateProgressionSelector,
  populateMotifSelector,
  populatePresetSelector,
  renderPaletteButtons,
  attachPaletteButtonHandlers,
  renderProgressionPresetInfo,
  toggleCustomCard,
  setTempoValue,
  updateGenerateButtonLabel,
  updateCustomHeaderCount,
  setStatusMessage,
  setPlayButtonsEnabled,
  updateLoopBadge,
  renderMixControls,
  renderHumanizeControls,
  renderSpatialControls,
  renderAssignmentTools,
  renderSamplerStatus,
  setMixCardCollapsed,
  setAdvancedControlsCollapsed,
  updatePianoRollPlayhead,
  updateMotifPlayhead,
  highlightProgressionBar,
  highlightLeftHandBar,
  highlightMotifCard,
  highlightScaleNote,
  resetPlaybackIndicators,
  runAssignmentPulse,
  pulsePresetCard,
  pulseSamplerBadge,
  showHint,
  pulseElement,
} from "./ui.js";

const MIX_PARTS = ["left", "lead"];
const SWING_MAX = 0.2;

const appStore = createAppStore();
const state = appStore.state;

let samplerSnapshot = getSamplerStatusSnapshot();
if (typeof window !== "undefined") {
  window.__samplerSnapshot = samplerSnapshot;
  window.__transportState = getTransportSnapshot().state;
}
let librarySwitchPending = false;
let playbackSession = null;
let playbackRafId = null;
/** rootNote -> { notes, source } for keys the player is holding on the page. */
const activeLivePianoNotes = new Map();
const pressedLivePianoRoots = new Set();

/** Every note the player plays, from any input, flows through this one stream. */
const noteInput = createNoteInputHub();
const midiInput = createMidiInput(noteInput, typeof window === "undefined" ? {} : window);
let audioRunning = false;

const dom = {};
const unlockAudio = createAudioUnlock({
  start: () => startAudioContext(),
  onUnlocked: () => {
    audioRunning = true;
    window.removeEventListener("click", handleUnlockClick);
  },
  onBlocked: (error, message) => {
    console.warn("Audio unlock failed", error);
    setStatusMessage(dom, message, { tone: "error" });
  },
});

function init() {
  Object.assign(dom, cacheDom());
  dom.__pianoIndicatorMode = state.ui.livePianoIndicatorMode;
  dom.__pianoGlissMode = state.ui.livePianoGlissMode;
  dom.__pianoComputerKeyboardEnabled = state.ui.livePianoComputerKeyboardEnabled;
  if (dom.pianoGlissToggle) dom.pianoGlissToggle.checked = state.ui.livePianoGlissMode;
  if (dom.pianoComputerKeyboardToggle) {
    dom.pianoComputerKeyboardToggle.checked = state.ui.livePianoComputerKeyboardEnabled;
  }
  if (dom.pianoChordMode) dom.pianoChordMode.value = state.ui.livePianoChordMode;
  buildPianoVisual(dom);
  attachPianoNoteListeners(dom);
  renderSamplerStatus(dom, samplerSnapshot);
  renderPlaceholders(dom);
  populateProgressionSelector(dom, PROGRESSION_PRESETS, state.inputs.progressionPresetId);
  populateMotifSelector(dom, MOTIF_STYLES);
  populatePresetSelector(dom, PRESET_CONFIGS, state.inputs.presetId || DEFAULT_PRESET_ID);
  if (dom.motif) dom.motif.value = state.inputs.motifId;
  if (dom.mode) dom.mode.value = state.inputs.mode;
  if (dom.tempoSlider) dom.tempoSlider.value = state.tempo;
  updateTempo(state.tempo);
  const initialStyleProfile = getStyleProfile(state.inputs.styleId);
  state.derived.styleProfile = initialStyleProfile;
  renderPaletteButtons(state.inputs.styleId, dom, STYLE_PALETTE_SETS, {
    mode: state.inputs.mode,
    styleProfile: initialStyleProfile,
  });
  attachPaletteButtonHandlers(dom, handleChordAdd);
  updateGenerateButtonLabel(dom, false);
  updateCustomHeaderCount(dom, 0);
  setPlayButtonsEnabled(dom, false);
  toggleCustomCard(dom, false);

  onSamplerStatus(handleSamplerStatus);
  audioEngine.init().catch((err) => {
    console.error("Sampler init failed", err);
    handleSamplerStatus({ phase: "error", error: err?.message || "Unable to load piano" });
  });
  setMixSettings(state.mix);
  updateAudioHumanize();
  applyFxSettings();
  renderMixControls(dom, state.mix);
  renderHumanizeControls(dom, state.playback);
  renderSpatialControls(dom, state.fx);
  setMixCardCollapsed(dom, state.ui.mixCollapsed);
  setAdvancedControlsCollapsed(dom, state.ui.advancedCollapsed);
  renderAssignmentTools(dom, state, {
    canUndo: appStore.canUndo(),
    canRedo: appStore.canRedo(),
  });
  wireEvents(dom, {
    onGenerate: handleGenerate,
    onPresetChange: handlePresetChange,
    onKeyChange: (value) => handleKeyChange(value),
    onModeChange: (value) => handleModeChange(value),
    onStyleChange: handleStyleChange,
    onLeftHandChange: handleLeftHandChange,
    onMotifChange: handleMotifChange,
    onLengthChange: handleLengthChange,
    onTempoChange: updateTempo,
    onStopAll: handleStopAll,
    onPlayAll: handlePlayAll,
    onPlay: handlePlay,
    onProgressionChange: handleProgressionChange,
    onClearCustom: clearCustomProgression,
    onMixChange: handleMixVolumeChange,
    onMixMute: handleMixMuteChange,
    onHumanizeToggle: handleHumanizeToggle,
    onHumanizeAmount: handleHumanizeAmount,
    onSwingAmount: handleSwingAmount,
    onReverbWetChange: handleReverbWetChange,
    onRoomSizeToggle: handleRoomSizeToggle,
    onMotifWidthChange: handleMotifWidthChange,
    onLibrarySelect: handleLibrarySelect,
    onMixCardToggle: handleMixCardToggle,
    onAdvancedControlsToggle: handleAdvancedControlsToggle,
    onAssignmentReroll: handleAssignmentReroll,
    onAssignmentUndo: handleAssignmentUndo,
    onAssignmentRedo: handleAssignmentRedo,
    onAssignmentLockToggle: handleAssignmentLockToggle,
    onPianoKeyDown: handlePianoKeyDown,
    onPianoKeyUp: handlePianoKeyUp,
    onPianoIndicatorModeChange: handlePianoIndicatorModeChange,
    onPianoGlissModeChange: handlePianoGlissModeChange,
    onPianoComputerKeyboardChange: handlePianoComputerKeyboardChange,
    onPianoChordModeChange: handlePianoChordModeChange,
  });
  dom.playAllLoop?.addEventListener("change", handlePlayAllLoopToggle);
  updateLoopBadge(dom, dom.playAllLoop?.checked || false);

  // Not { once: true }: if Tone.start() rejects, the listener would already be
  // gone and the user would be left with a page that silently never plays.
  // The listener removes itself only once the context is actually running.
  window.addEventListener("click", handleUnlockClick);
  const initialPresetId = state.inputs.presetId || DEFAULT_PRESET_ID;
  if (initialPresetId) {
    applyPreset(initialPresetId, { autoGenerate: true });
  } else {
    handleGenerate({ auto: true });
  }

  startMidiPlayThrough();
  window.addEventListener("pagehide", () => midiInput.disconnect());
  mountCoach(createCoachBridge());
}

/**
 * The coach is a React root layered over this application. It reads the
 * committed assignment and sampler status, and asks for audio unlock, through
 * this bridge - never by reaching into module state or the legacy DOM.
 */
function createCoachBridge() {
  let cachedDerived = null;
  let cachedAssignment = null;
  let cachedSampler = getSamplerStatusSnapshot();
  const samplerListeners = new Set();
  onSamplerStatus((status) => {
    cachedSampler = status?.snapshot || getSamplerStatusSnapshot();
    samplerListeners.forEach((listener) => listener());
  });

  return {
    audioEngine,
    getAssignment() {
      // state.derived is replaced on every commit, so its identity is a
      // correct and cheap change signal for useSyncExternalStore.
      if (state.derived !== cachedDerived) {
        cachedDerived = state.derived;
        cachedAssignment = state.derived?.score
          ? { score: state.derived.score, leftHand: state.derived.leftHand, motif: state.derived.motif }
          : null;
      }
      return cachedAssignment;
    },
    subscribeAssignment: (listener) => appStore.subscribe(listener),
    getSamplerSnapshot: () => cachedSampler,
    subscribeSampler(listener) {
      samplerListeners.add(listener);
      return () => samplerListeners.delete(listener);
    },
    getTempoBpm: () => Number(state.tempo),
    unlockAudio,
    stopOtherPlayback: () => stopAllPlayback(),
    reportError: (message) => setStatusMessage(dom, message, { tone: "error" }),
    openAssignmentDrawer() {
      const drawer = document.getElementById("legacy-drawer");
      if (!drawer) return;
      drawer.open = true;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      drawer.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      drawer.querySelector("summary")?.focus();
    },
    getKeyboardElement: () => dom.pianoVisual || null,
    noteInput,
    midiInput,
    setMidiPlayThrough,
  };
}

function updateTempo(value) {
  state.tempo = value;
  audioEngine.setTempo(Number(value));
  setTempoValue(dom, value);
}

function resolveLength(rawLength, progressionPresetId) {
  const presetForLength = getProgressionPreset(progressionPresetId);
  const presetLength = presetForLength?.roman?.length || 4;
  if (!rawLength || Number.isNaN(rawLength)) return presetLength;
  return rawLength;
}

// Validation failures phrased for the person editing, not the developer.
const DRAFT_BLOCKED_MESSAGES = {
  "custom progressions require at least one chord": "Add at least one chord to use your custom palette.",
};

/**
 * Derive and commit an assignment from the current inputs.
 *
 * The chord palette is edited one chord at a time, so inputs legitimately pass
 * through states that are not yet a complete assignment - selecting "Custom"
 * before adding any chord is the obvious one. generateAssignment throws on those,
 * and six handlers called this with no guard, so changing the key while a custom
 * progression was empty killed the interaction with nothing shown to the user.
 *
 * An incomplete draft is now an expected state rather than an error: the last
 * valid assignment stays committed and on screen, and the user is told what is
 * missing.
 *
 * @returns {{ ok: boolean, assignment?: object, errors?: string[] }}
 */
function computeDerived() {
  const { valid, errors } = validateAssignmentInputs(state.inputs);
  if (!valid) {
    showHint(dom, DRAFT_BLOCKED_MESSAGES[errors[0]] || `Can't build that yet: ${errors.join("; ")}`);
    return { ok: false, errors };
  }

  try {
    const assignment = generateAssignment(state.inputs);
    appStore.commitAssignment(assignment);
    updateAudioHumanize();
    return { ok: true, assignment };
  } catch (error) {
    // Validation passed but generation still failed: a real defect, not a draft.
    console.error("Assignment generation failed", error);
    setStatusMessage(dom, `Could not build that assignment: ${error?.message || "unknown error"}`, {
      tone: "error",
    });
    return { ok: false, errors: [error?.message || "unknown error"] };
  }
}

function syncInputsFromDom() {
  const rawLength = Number(dom.length?.value);
  const progressionPresetId = dom.progressionSelect?.value || state.inputs.progressionPresetId;

  state.inputs = {
    ...state.inputs,
    key: dom.key?.value || state.inputs.key,
    mode: dom.mode?.value || state.inputs.mode,
    progressionPresetId,
    styleId: dom.styleSelect?.value || state.inputs.styleId,
    length: resolveLength(rawLength, progressionPresetId),
    lhId: dom.leftHand?.value || state.inputs.lhId,
    motifId: dom.motif?.value || state.inputs.motifId,
    presetId: dom.presetSelect?.value || state.inputs.presetId,
  };

  if (progressionPresetId !== "custom") {
    updateGenerateButtonLabel(dom, false);
    toggleCustomCard(dom, false);
  } else {
    updateGenerateButtonLabel(dom, true);
    toggleCustomCard(dom, true);
  }
}

// Callers pass { auto: true } (see the preset and fallback paths below) but this
// function has never acted on it. Kept as an explicit, named no-op so the
// discrepancy stays visible instead of being silently dropped.
function handleGenerate(_options = {}) {
  syncInputsFromDom();

  if (state.inputs.progressionPresetId === "custom" && state.inputs.customProgressionRoman.length === 0) {
    state.inputs.progressionPresetId = PROGRESSION_PRESETS[0].id;
    if (dom.progressionSelect) dom.progressionSelect.value = state.inputs.progressionPresetId;
    toggleCustomCard(dom, false);
    updateGenerateButtonLabel(dom, false);
    showHint(dom, "Add at least one chord to use your custom palette.");
    if (dom.customPreview) {
      pulseElement(dom.customPreview, "status");
    }
  }

  const result = computeDerived();
  renderAll();
  syncPlayButtonsAvailability();
  if (!result.ok) return;

  const preset = getProgressionPreset(state.inputs.progressionPresetId);
  const scaleLabel = state.derived.scale?.label
    ? `${state.inputs.key} ${state.derived.scale.label}`
    : state.inputs.key;
  const status = `Assignment updated for ${scaleLabel} · ${preset?.label || "Custom"} · ${state.derived.leftHand?.name || state.inputs.lhId} · ${state.derived.motif ? state.derived.motif.description : "No motif"}`;
  // Keep the direct response to Generate visible long enough to be read. A
  // sampler-ready message is ambient and will be restored after this expires.
  setStatusMessage(dom, status, { tone: "success", transient: true });
  runAssignmentPulse(dom, { includeMotif: !!state.derived.motif });
  pulseElement(dom.generate, "accent");
}

function handleKeyChange(key) {
  state.inputs.key = key;
  computeDerived();
  renderAll();
}

function handleModeChange(mode) {
  state.inputs.mode = mode || "major";
  const styleProfile = getStyleProfile(state.inputs.styleId);
  state.derived = { ...state.derived, styleProfile };
  renderPaletteButtons(state.inputs.styleId, dom, STYLE_PALETTE_SETS, {
    mode: state.inputs.mode,
    styleProfile,
  });
  attachPaletteButtonHandlers(dom, handleChordAdd);
  renderCustomProgressionPreview(state, dom);
  computeDerived();
  renderAll();
}

function handlePresetChange(presetId) {
  pulsePresetCard(dom);
  if (!presetId || presetId === state.inputs.presetId) {
    applyPreset(presetId || state.inputs.presetId, { autoGenerate: true });
    return;
  }
  applyPreset(presetId, { autoGenerate: true });
}

function handleStyleChange(styleId) {
  state.inputs.styleId = styleId || "classical";
  const styleProfile = getStyleProfile(state.inputs.styleId);
  state.derived = { ...state.derived, styleProfile };
  renderPaletteButtons(state.inputs.styleId, dom, STYLE_PALETTE_SETS, {
    mode: state.inputs.mode,
    styleProfile,
  });
  attachPaletteButtonHandlers(dom, handleChordAdd);
  renderCustomProgressionPreview(state, dom);
  computeDerived();
  renderAll();
}

function handleLeftHandChange(lhId) {
  if (!lhId) return;
  state.inputs.lhId = lhId;
  computeDerived();
  renderAll();
}

function handleMotifChange(motifId) {
  if (!motifId) return;
  state.inputs.motifId = motifId;
  computeDerived();
  renderAll();
}

function handleLengthChange(newLength) {
  const lengthNumber = Number(newLength);
  const resolvedLength = resolveLength(lengthNumber, state.inputs.progressionPresetId);
  state.inputs.length = resolvedLength;
  if (dom.length) {
    dom.length.value = String(resolvedLength);
  }
  computeDerived();
  renderAll();
}

function handleProgressionChange(id) {
  state.inputs.progressionPresetId = id;
  const isCustom = id === "custom";
  toggleCustomCard(dom, isCustom);
  updateGenerateButtonLabel(dom, isCustom);
  if (isCustom && state.inputs.customProgressionRoman.length === 0) {
    renderCustomProgressionPreview(state, dom);
    return;
  }
  computeDerived();
  renderAll();
  renderProgressionPresetInfo(
    dom,
    getProgressionPreset(id),
    getStyleProfile(state.inputs.styleId),
    state.derived.progression,
  );
}

function handleChordAdd(chord) {
  state.inputs.customProgressionRoman.push(chord);
  renderCustomProgressionPreview(state, dom);
  updateCustomHeaderCount(dom, state.inputs.customProgressionRoman.length);
}

function clearCustomProgression() {
  state.inputs.customProgressionRoman = [];
  renderCustomProgressionPreview(state, dom);
  updateCustomHeaderCount(dom, 0);
}

function ensureAssignmentReady() {
  const ready = Boolean(state.derived?.progression && state.derived?.leftHand);
  if (!ready) {
    showHint(dom, "Generate an assignment first to unlock playback.");
    pulseElement(dom.generate, "accent");
  }
  return ready;
}

function handleUnlockClick() {
  void unlockAudio();
}

function ensureSamplerReady() {
  if (isPianoLoaded()) {
    return true;
  }
  showHint(dom, "Piano samples are still loading. We'll let you know when they're ready.");
  pulseSamplerBadge(dom);
  return false;
}

async function handlePlay(target) {
  if (!ensureAssignmentReady() || !ensureSamplerReady()) {
    return;
  }
  if (!(await unlockAudio())) return;
  stopAllPlayback();

  switch (target) {
    case "scale": {
      const loopEnabled = dom.scaleLoop?.checked || false;
      playScale(state.derived.scale, loopEnabled, {
        onNote: (note) => highlightScaleNote(dom, note),
        onComplete: () => highlightScaleNote(dom, null),
      });
      break;
    }
    case "progression": {
      const totalBeats = getLeftHandBeats();
      const loopEnabled = dom.loopToggle?.checked || false;
      playScoreParts(["lh"], loopEnabled);
      startPlaybackVisuals({
        totalBeats,
        loopEnabled,
        showProgression: true,
      });
      break;
    }
    case "left-hand": {
      const totalBeats = getLeftHandBeats();
      const loopEnabled = dom.lhLoop?.checked || false;
      playScoreParts(["lh"], loopEnabled);
      startPlaybackVisuals({
        totalBeats,
        loopEnabled,
        showLeftHand: true,
      });
      break;
    }
    case "motif": {
      const motif = state.derived.motif;
      if (!motif) {
        showHint(dom, "Pick a motif style to hear a lead idea, or leave it set to None.");
        pulseElement(dom.motifCard, "card");
        return;
      }
      const loopEnabled = dom.motifLoop?.checked || false;
      const motifBeats = Math.min(motif.totalBeats || 0, state.derived.score.meta.totalBeats);
      playScoreParts(["rh"], loopEnabled, [0, Math.ceil(motifBeats / 4) - 1]);
      startPlaybackVisuals({
        totalBeats: motifBeats,
        loopEnabled,
        showMotif: true,
        motifBeats,
      });
      break;
    }
  }
}

function handleStopAll() {
  stopAllPlayback();
}

async function handlePianoKeyDown(rootNote, source = "pointer") {
  if (!rootNote) return;
  releaseLivePianoRoot(rootNote);
  const notes = getLivePianoChordNotes(rootNote, state.ui.livePianoChordMode, state.derived.scale);
  const entry = { notes, source };
  activeLivePianoNotes.set(rootNote, entry);
  pressedLivePianoRoots.add(rootNote);
  // Mirror what was played straight away, even before audio can sound it.
  notes.forEach((note) => emitPlayedNote("noteOn", note, source));

  if (!ensureSamplerReady()) return;
  if (!(await unlockAudio())) return;
  // A quick tap can end while the AudioContext is still resuming. Do not start
  // a sustained note after its corresponding key-up has already happened.
  if (activeLivePianoNotes.get(rootNote) !== entry) return;
  notes.forEach((note) => playPreviewNoteDown(note, { part: "lead" }));
}

function handlePianoKeyUp(rootNote) {
  releaseLivePianoRoot(rootNote);
}

function releaseLivePianoRoot(rootNote) {
  pressedLivePianoRoots.delete(rootNote);
  const entry = activeLivePianoNotes.get(rootNote);
  if (!entry) return;
  activeLivePianoNotes.delete(rootNote);
  entry.notes.forEach((note) => {
    playPreviewNoteUp(note, { part: "lead" });
    emitPlayedNote("noteOff", note, entry.source);
  });
}

function releaseAllLivePianoRoots() {
  [...activeLivePianoNotes.keys()].forEach(releaseLivePianoRoot);
  pressedLivePianoRoots.clear();
}

function emitPlayedNote(type, note, source, velocity = 0.8) {
  const midi = noteStringToMidi(note);
  if (!Number.isInteger(midi)) return;
  noteInput.emit(type === "noteOn" ? { type, midi, velocity, source } : { type, midi, source });
}

/**
 * MIDI play-through. A MIDI keyboard usually has its own sound, so by default its
 * notes are only mirrored; with play-through on they also sound on the app's
 * piano. Held-note state includes the sustain pedal, so a pedalled note keeps
 * sounding until the pedal lifts.
 */
function startMidiPlayThrough() {
  let held = EMPTY_HELD_NOTES;
  let sounding = new Map();
  const velocities = new Map();

  const sync = () => {
    const enabled = midiInput.getState().status === "connected" && midiInput.getState().playThrough;
    const next = enabled && audioRunning && isPianoLoaded() ? playedNotes(held, ["midi"]) : new Map();
    const { started, stopped } = soundingChanges(sounding, next);
    stopped.forEach((midi) => playPreviewNoteUp(midiToNote(midi), { part: "lead" }));
    started.forEach((midi) =>
      playPreviewNoteDown(midiToNote(midi), { part: "lead", velocity: velocities.get(midi) ?? 0.8 }),
    );
    sounding = next;
  };

  noteInput.subscribe((event) => {
    if (event.source !== "midi") return;
    if (event.type === "noteOn") velocities.set(event.midi, event.velocity);
    held = reduceHeldNotes(held, event);
    sync();
  });
  midiInput.subscribe(sync);
}

async function setMidiPlayThrough(enabled) {
  // Called from a click, so this is the gesture that lets MIDI notes sound.
  if (enabled && !(await unlockAudio())) return;
  midiInput.setPlayThrough(enabled);
}

function handlePianoIndicatorModeChange(mode) {
  state.ui.livePianoIndicatorMode = mode === "lh" || mode === "rh" ? mode : "both";
  clearPianoHighlights(dom);
}

function handlePianoGlissModeChange(enabled) {
  state.ui.livePianoGlissMode = !!enabled;
}

function handlePianoComputerKeyboardChange(enabled) {
  state.ui.livePianoComputerKeyboardEnabled = !!enabled;
}

function handlePianoChordModeChange(mode) {
  state.ui.livePianoChordMode = mode || "single";
}

async function handlePlayAll() {
  if (!ensureAssignmentReady() || !ensureSamplerReady()) {
    return;
  }
  if (!(await unlockAudio())) return;
  stopAllPlayback();
  const loopEnabled = dom.playAllLoop?.checked || false;
  updateLoopBadge(dom, loopEnabled);
  applyPlayAllLoop(loopEnabled);
  playScoreParts(["lh", "rh"], loopEnabled);
  publishTransportState();
  const motifBeats = state.derived?.motif?.totalBeats || 0;
  startPlaybackVisuals({
    totalBeats: getPlayAllBeats(),
    loopEnabled,
    showPianoRoll: true,
    showProgression: true,
    showLeftHand: true,
    showMotif: !!state.derived?.motif,
    motifBeats,
  });
}

function handlePlayAllLoopToggle(event) {
  const enabled = !!event.target.checked;
  updateLoopBadge(dom, enabled);
  applyPlayAllLoop(enabled);
}

function playScoreParts(parts, loopEnabled, barRange) {
  const score = state.derived?.score;
  if (!score) throw new Error("A canonical score is required for playback");
  return audioEngine.play({
    score,
    parts,
    barRange: barRange || [0, score.meta.bars - 1],
    rate: 1,
    loop: !!loopEnabled,
    countIn: false,
    tempoBpm: Number(state.tempo),
  });
}

function getLeftHandBeats() {
  const progressionBars = state.derived.progression?.length;
  const lhBars = state.derived.leftHand?.bars?.length;
  const bars = progressionBars || lhBars || 1;
  return bars * 4;
}

function getPlayAllBeats() {
  const progressionBars = state.derived?.progression?.length || 0;
  const lhBars = state.derived?.leftHand?.bars?.length || 0;
  const bars = progressionBars || lhBars || 0;
  return bars * 4;
}

function applyPlayAllLoop(enabled) {
  const totalBeats = getPlayAllBeats();
  configureLoop(totalBeats, enabled);
}

function stopAllPlayback() {
  stopTransport();
  releaseAllLivePianoRoots();
  publishTransportState();
  stopPlaybackVisuals();
  highlightScaleNote(dom, null);
}

function publishTransportState() {
  if (typeof window !== "undefined") {
    window.__transportState = getTransportSnapshot().state;
  }
}

function startPlaybackVisuals(options = {}) {
  const totalBeats = options.totalBeats ?? getPlayAllBeats();
  if (!totalBeats || !Number.isFinite(totalBeats)) {
    resetPlaybackIndicators(dom);
    return;
  }
  teardownPlaybackSession({ resetIndicators: false });
  const motifBeats = options.motifBeats ?? (state.derived?.motif?.totalBeats || 0);
  playbackSession = {
    totalBeats,
    loopEnabled: !!options.loopEnabled,
    showPianoRoll: !!options.showPianoRoll,
    showProgression: !!options.showProgression,
    showLeftHand: !!options.showLeftHand,
    showMotif: !!options.showMotif && motifBeats > 0,
    motifBeats,
  };
  schedulePlaybackVisualTick();
}

function stopPlaybackVisuals(options) {
  teardownPlaybackSession(options);
}

function teardownPlaybackSession({ resetIndicators = true } = {}) {
  if (playbackRafId != null) {
    cancelVisualTick(playbackRafId);
    playbackRafId = null;
  }
  playbackSession = null;
  if (resetIndicators) {
    resetPlaybackIndicators(dom);
  }
}

function schedulePlaybackVisualTick() {
  if (!playbackSession) return;
  if (playbackRafId != null) {
    cancelVisualTick(playbackRafId);
  }
  const raf =
    typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 1000 / 60);
  playbackRafId = raf(() => updatePlaybackVisuals());
}

function updatePlaybackVisuals() {
  if (!playbackSession) return;
  const isRunning = getTransportSnapshot().state === "started";
  if (!isRunning) {
    stopPlaybackVisuals();
    return;
  }

  const beatsElapsed = getTransportBeats();
  const { totalBeats, loopEnabled, showPianoRoll, showProgression, showLeftHand, showMotif, motifBeats } =
    playbackSession;
  if (!totalBeats || !Number.isFinite(beatsElapsed)) {
    resetPlaybackIndicators(dom);
    schedulePlaybackVisualTick();
    return;
  }

  const normalizedBeats = loopEnabled ? beatsElapsed % totalBeats : Math.min(beatsElapsed, totalBeats);
  const ratio = totalBeats ? normalizedBeats / totalBeats : 0;
  if (showPianoRoll) {
    updatePianoRollPlayhead(dom, ratio);
  } else {
    updatePianoRollPlayhead(dom, null);
  }

  const currentBar = totalBeats ? Math.floor(normalizedBeats / 4) : null;
  if (showProgression) {
    highlightProgressionBar(dom, currentBar);
  } else {
    highlightProgressionBar(dom, null);
  }

  if (showLeftHand) {
    highlightLeftHandBar(dom, currentBar);
  } else {
    highlightLeftHandBar(dom, null);
  }

  if (showMotif) {
    highlightMotifCard(dom, currentBar);
    if (motifBeats > 0) {
      const motifPosition = normalizedBeats % motifBeats;
      const motifRatio = motifBeats ? motifPosition / motifBeats : null;
      updateMotifPlayhead(dom, motifRatio);
    } else {
      updateMotifPlayhead(dom, null);
    }
  } else {
    highlightMotifCard(dom, null);
    updateMotifPlayhead(dom, null);
  }

  const playbackComplete = !loopEnabled && beatsElapsed >= totalBeats;
  if (playbackComplete) {
    stopPlaybackVisuals();
    return;
  }

  schedulePlaybackVisualTick();
}

function getTransportBeats() {
  return getTransportSnapshot().positionBeats;
}

function cancelVisualTick(id) {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

function renderAll() {
  renderScale(state, dom);
  renderPianoDiatonic(dom, state.derived.scale);
  renderProgression(state, dom, getProgressionPreset);
  renderLeftHand(state, dom);
  renderMotif(state, dom);
  renderPianoRoll(state, dom);
  renderCustomProgressionPreview(state, dom);
  renderProgressionPresetInfo(
    dom,
    getProgressionPreset(state.inputs.progressionPresetId),
    state.derived.styleProfile || getStyleProfile(state.inputs.styleId),
    state.derived.progression,
  );
  updateCustomHeaderCount(dom, state.inputs.customProgressionRoman.length);
  renderMixControls(dom, state.mix);
  renderHumanizeControls(dom, state.playback);
  renderSpatialControls(dom, state.fx);
  renderAssignmentTools(dom, state, {
    canUndo: appStore.canUndo(),
    canRedo: appStore.canRedo(),
  });
  syncPlayButtonsAvailability();
}

function handleAssignmentReroll() {
  if (["key", "harmony", "groove", "motif"].every((part) => state.locks[part])) {
    showHint(dom, "Unlock at least one part before rerolling.");
    return;
  }
  stopAllPlayback();
  appStore.reroll();
  computeDerived();
  syncAssignmentUiFromState();
  renderAll();
  const shortId = state.assignment.id.replace(/^assignment-/, "");
  setStatusMessage(dom, `Created variation ${shortId} · locked parts were kept`, {
    tone: "success",
  });
  pulseElement(dom.assignmentReroll, "accent");
}

function handleAssignmentUndo() {
  stopAllPlayback();
  const assignment = appStore.undo();
  if (!assignment) return;
  syncAssignmentUiFromState();
  renderAll();
  setStatusMessage(dom, "Restored the previous assignment", { tone: "info" });
}

function handleAssignmentRedo() {
  stopAllPlayback();
  const assignment = appStore.redo();
  if (!assignment) return;
  syncAssignmentUiFromState();
  renderAll();
  setStatusMessage(dom, "Restored the next assignment", { tone: "info" });
}

function handleAssignmentLockToggle(component) {
  const locks = appStore.toggleLock(component);
  renderAssignmentTools(dom, state, {
    canUndo: appStore.canUndo(),
    canRedo: appStore.canRedo(),
  });
  const label = component.charAt(0).toUpperCase() + component.slice(1);
  setStatusMessage(dom, `${label} ${locks[component] ? "locked" : "unlocked"} for the next reroll`, {
    tone: "info",
  });
}

function syncAssignmentUiFromState() {
  const inputs = state.inputs;
  const setValue = (element, value) => {
    if (element) element.value = value == null ? "" : String(value);
  };
  setValue(dom.presetSelect, inputs.presetId);
  setValue(dom.key, inputs.key);
  setValue(dom.mode, inputs.mode);
  setValue(dom.progressionSelect, inputs.progressionPresetId);
  setValue(dom.leftHand, inputs.lhId);
  setValue(dom.motif, inputs.motifId);
  setValue(dom.length, inputs.length);
  setValue(dom.styleSelect, inputs.styleId);

  const styleProfile = getStyleProfile(inputs.styleId);
  renderPaletteButtons(inputs.styleId, dom, STYLE_PALETTE_SETS, {
    mode: inputs.mode,
    styleProfile,
  });
  attachPaletteButtonHandlers(dom, handleChordAdd);
  const isCustom = inputs.progressionPresetId === "custom";
  toggleCustomCard(dom, isCustom);
  updateGenerateButtonLabel(dom, isCustom);
}

function handleMixVolumeChange(partId, value) {
  if (!MIX_PARTS.includes(partId)) return;
  const clamped = clampDb(value);
  state.mix[partId] = { ...state.mix[partId], volume: clamped };
  setMixSettings({ [partId]: state.mix[partId] });
  renderMixControls(dom, state.mix);
}

function handleMixMuteChange(partId, mute) {
  if (!MIX_PARTS.includes(partId)) return;
  state.mix[partId] = { ...state.mix[partId], mute: !!mute };
  setMixSettings({ [partId]: state.mix[partId] });
  renderMixControls(dom, state.mix);
}

function handleMixCardToggle() {
  state.ui.mixCollapsed = !state.ui.mixCollapsed;
  setMixCardCollapsed(dom, state.ui.mixCollapsed);
}

function handleAdvancedControlsToggle() {
  state.ui.advancedCollapsed = !state.ui.advancedCollapsed;
  setAdvancedControlsCollapsed(dom, state.ui.advancedCollapsed);
}

function applyPreset(presetId, options = {}) {
  const fallbackId = DEFAULT_PRESET_ID || PRESET_CONFIGS[0]?.id;
  const preset = getPresetConfig(presetId) || getPresetConfig(fallbackId);
  if (!preset) return;

  state.inputs.presetId = preset.id;
  if (dom.presetSelect) {
    dom.presetSelect.value = preset.id;
  }

  const setSelectValue = (element, value) => {
    if (element && value != null) {
      element.value = value;
    }
  };

  setSelectValue(dom.key, preset.key);
  setSelectValue(dom.mode, preset.mode);
  setSelectValue(dom.progressionSelect, preset.progressionPresetId);
  setSelectValue(dom.leftHand, preset.lhId);
  setSelectValue(dom.motif, preset.motifId);
  if (preset.length && dom.length) {
    const desired = String(preset.length);
    const hasOption = Array.from(dom.length.options || []).some((opt) => opt.value === desired);
    dom.length.value = hasOption ? desired : dom.length.options?.[0]?.value || desired;
  }

  if (preset.styleId && dom.styleSelect) {
    dom.styleSelect.value = preset.styleId;
    const styleProfile = getStyleProfile(preset.styleId);
    state.derived = { ...state.derived, styleProfile };
    renderPaletteButtons(preset.styleId, dom, STYLE_PALETTE_SETS, {
      mode: preset.mode || state.inputs.mode,
      styleProfile,
    });
    attachPaletteButtonHandlers(dom, handleChordAdd);
  }

  syncInputsFromDom();
  if (options.autoGenerate !== false) {
    handleGenerate({ auto: true });
  }
}

function handleHumanizeToggle(enabled) {
  state.playback.humanizeEnabled = !!enabled;
  renderHumanizeControls(dom, state.playback);
  updateAudioHumanize();
}

function handleHumanizeAmount(value) {
  state.playback.humanizeAmount = clamp01(value / 100);
  renderHumanizeControls(dom, state.playback);
  updateAudioHumanize();
}

function handleSwingAmount(value) {
  state.playback.swingAmount = clamp01(value / 100);
  renderHumanizeControls(dom, state.playback);
  updateAudioHumanize();
}

function handleReverbWetChange(value) {
  state.fx.reverbWet = clamp01(value / 100);
  setReverbWet(state.fx.reverbWet);
  renderSpatialControls(dom, state.fx);
}

function handleRoomSizeToggle(isLarge) {
  state.fx.roomSizeLarge = !!isLarge;
  setRoomSize(state.fx.roomSizeLarge ? "large" : "small");
  renderSpatialControls(dom, state.fx);
}

function handleMotifWidthChange(value) {
  state.fx.motifWidth = clamp01(value / 100);
  setMotifWidth(state.fx.motifWidth);
  renderSpatialControls(dom, state.fx);
}

function updateAudioHumanize() {
  const styleProfile = state.derived?.styleProfile || getStyleProfile(state.inputs.styleId);
  const enabled = !!state.playback.humanizeEnabled;
  const amount = enabled ? state.playback.humanizeAmount : 0;
  const swingDelta = enabled ? state.playback.swingAmount * SWING_MAX : 0;
  setHumanizeSettings({
    enabled,
    amount,
    swing: swingDelta,
    styleDefaults: styleProfile?.humanize,
  });
}

function applyFxSettings() {
  setReverbWet(state.fx.reverbWet);
  setRoomSize(state.fx.roomSizeLarge ? "large" : "small");
  setMotifWidth(state.fx.motifWidth);
}

function handleSamplerStatus(status = {}) {
  if (status.snapshot) {
    samplerSnapshot = status.snapshot;
  }
  if (typeof window !== "undefined") {
    window.__samplerSnapshot = samplerSnapshot;
  }
  renderSamplerStatus(dom, samplerSnapshot);

  if (status.isDefault && status.phase !== "ready") {
    setPlayButtonsEnabled(dom, false);
  }

  if (status.phase === "error" || status.phase === "timeout") {
    const scope = status.label || (status.isDefault ? "Primary piano" : "Selected piano");
    const hint = status.isDefault ? "Trying backup piano" : "Select it again to retry";
    setStatusMessage(dom, `${scope} error: ${status.error || "check connection"} · ${hint}`, {
      tone: "error",
    });
    if (status.isDefault) {
      requestFallbackPianoLoad("auto-error").catch((err) => console.warn("Auto fallback load failed", err));
    }
    return;
  }

  if (status.isDefault && status.phase === "ready") {
    setStatusMessage(dom, `${status.label || "Piano"} ready for playback`, {
      ambient: true,
      tone: "success",
    });
    syncPlayButtonsAvailability();
    return;
  }

  if (!status.isDefault && status.phase === "ready") {
    setStatusMessage(dom, `${status.label || "Piano"} ready · active`, {
      ambient: true,
      tone: "success",
    });
    syncPlayButtonsAvailability();
    return;
  }
}

function syncPlayButtonsAvailability() {
  const hasMusic = Boolean(state.derived?.progression && state.derived?.leftHand);
  const ready = isPianoLoaded();
  setPlayButtonsEnabled(dom, hasMusic && ready);
}

function clampDb(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(6, Math.max(-36, value));
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

async function handleLibrarySelect(libraryId) {
  await loadLibraryChoice(libraryId, { allowActiveReload: false, verb: "Switching to" });
}

async function loadLibraryChoice(libraryId, { allowActiveReload, verb } = {}) {
  if (!libraryId || librarySwitchPending) return;
  if (!allowActiveReload && libraryId === samplerSnapshot?.activeLibraryId) {
    const phase = samplerSnapshot?.libraries?.[libraryId]?.phase;
    if (phase === "ready") {
      return;
    }
  }
  librarySwitchPending = true;
  lockPianoModelSelect(true);
  const targetLabel = getSamplerLabelById(libraryId);
  setStatusMessage(dom, `${verb || "Switching"} ${targetLabel} samples…`, {
    ambient: true,
    tone: "info",
  });
  try {
    await requestLibraryLoad(libraryId);
  } catch (err) {
    console.error("Library load failed", err);
    setStatusMessage(dom, `Unable to load ${targetLabel}: ${err?.message || err}`, {
      tone: "error",
    });
    if (!allowActiveReload && dom.pianoModel && samplerSnapshot?.activeLibraryId) {
      dom.pianoModel.value = samplerSnapshot.activeLibraryId;
    }
  } finally {
    librarySwitchPending = false;
    lockPianoModelSelect(false);
  }
}

function lockPianoModelSelect(locked) {
  if (!dom.pianoModel) return;
  dom.pianoModel.dataset.locked = locked ? "true" : "false";
  dom.pianoModel.disabled = !!locked;
}

function getSamplerLabelById(libraryId) {
  return samplerSnapshot?.libraries?.[libraryId]?.label || "selected";
}

document.addEventListener("DOMContentLoaded", init);
