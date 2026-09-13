import {
  MOTIF_STYLES,
  SCALE_PATTERNS,
  getProgressionPreset,
  getStyleProfile,
  midiToNote,
  noteStringToMidi,
} from "../theory.js";

import {
  MotifNotOfferedError,
  generateLearnerAssignment,
  rerollAssignmentInputs,
  validateAssignmentInputs,
} from "../domain/assignment.js";
import { getLivePianoChordNotes } from "../domain/live-piano.js";
import { createAppStore } from "./state.js";
import { LIBRARY_STORAGE_KEY, createLibrary } from "./library.ts";
import {
  createPracticeRecord,
  finishPracticeRecord,
  recommendPractice,
  updatePracticeProgress,
} from "./practice-record.ts";
import { browserStorage, subscribeToStorageKey } from "../infrastructure/browser-storage.ts";
import { createShareLocation } from "../infrastructure/share-location.ts";
import { createOfflineSupport } from "../infrastructure/pwa.ts";
import { createRuntimeTestAdapter } from "../infrastructure/test-adapter.ts";
import { createShareController } from "./share-controller.ts";
import { createStatusService } from "./status.ts";
import { decodeShareFragment, encodeShareFragment } from "../domain/share.ts";
import { createAudioUnlock } from "./audio-unlock.js";
import {
  attachPianoNoteListeners,
  buildPianoVisual,
  clearPianoHighlights,
  renderPianoDiatonic,
} from "../components/piano.js";
import { cachePianoDom, wirePianoInteractions } from "../components/piano-interactions.js";
import { DEFAULT_PRESET_ID, getPresetConfig } from "../presets.js";
import { mountCoach } from "../coach/mount.tsx";
import { createNoteInputHub } from "../input/note-input.ts";
import { createMidiInput } from "../input/midi.ts";
import { EMPTY_HELD_NOTES, playedNotes, reduceHeldNotes, soundingChanges } from "../input/held-notes.ts";
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
} from "../audio.js";

const MIX_PARTS = ["left", "lead"];
const SWING_MAX = 0.2;

const appStore = createAppStore();
const state = appStore.state;
const status = createStatusService();
/** Starred assignments, the last assignment, tempo and preferences, kept in this browser. */
const practiceLibrary = createLibrary(browserStorage());
const shareLocation = createShareLocation(window);
const shareController = createShareController({
  location: shareLocation,
  currentInputs: () => state.assignment?.inputs ?? null,
  openInputs,
  beforeOpen: stopAllPlayback,
});
const runtimeDisposers = [];
let initialized = false;
/** Offline cache and update lifecycle; inert until init() creates it for this page. */
let offlineSupport = null;

let samplerSnapshot = getSamplerStatusSnapshot();
const testAdapter = createRuntimeTestAdapter(window, {
  sampler: samplerSnapshot,
  transport: getTransportSnapshot().state,
});
let librarySwitchPending = false;
let resetScaleAudition = () => {};
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
    status.show(message, { tone: "error" });
  },
});

function init(production) {
  if (initialized) return;
  initialized = true;
  keep(() => testAdapter.dispose());
  keep(() => status.dispose());
  Object.assign(dom, cachePianoDom());
  dom.__pianoIndicatorMode = state.ui.livePianoIndicatorMode;
  dom.__pianoGlissMode = state.ui.livePianoGlissMode;
  dom.__pianoComputerKeyboardEnabled = state.ui.livePianoComputerKeyboardEnabled;
  if (dom.pianoGlissToggle) dom.pianoGlissToggle.checked = state.ui.livePianoGlissMode;
  if (dom.pianoComputerKeyboardToggle) {
    dom.pianoComputerKeyboardToggle.checked = state.ui.livePianoComputerKeyboardEnabled;
  }
  if (dom.pianoChordMode) dom.pianoChordMode.value = state.ui.livePianoChordMode;
  buildPianoVisual(dom);
  keep(attachPianoNoteListeners(dom));
  state.tempo = practiceLibrary.tempo() ?? state.tempo;
  updateTempo(state.tempo);
  const initialStyleProfile = getStyleProfile(state.inputs.styleId);
  state.derived.styleProfile = initialStyleProfile;

  keep(onSamplerStatus(handleSamplerStatus));
  audioEngine.init().catch((err) => {
    console.error("Sampler init failed", err);
    handleSamplerStatus({ phase: "error", error: err?.message || "Unable to load piano" });
  });
  setMixSettings(state.mix);
  updateAudioHumanize();
  applyFxSettings();
  keep(
    wirePianoInteractions(dom, {
      onPianoKeyDown: handlePianoKeyDown,
      onPianoKeyUp: handlePianoKeyUp,
      onPianoIndicatorModeChange: handlePianoIndicatorModeChange,
      onPianoGlissModeChange: handlePianoGlissModeChange,
      onPianoComputerKeyboardChange: handlePianoComputerKeyboardChange,
      onPianoChordModeChange: handlePianoChordModeChange,
    }),
  );

  // Not { once: true }: if Tone.start() rejects, the listener would already be
  // gone and the user would be left with a page that silently never plays.
  // The listener removes itself only once the context is actually running.
  window.addEventListener("click", handleUnlockClick);
  keep(() => window.removeEventListener("click", handleUnlockClick));

  // Every committed assignment - generated, rerolled, undone, opened from a link or
  // a star - is remembered and written into the address bar, so the page's own URL
  // is always a share link and a reload comes back to the same music.
  keep(appStore.subscribe(rememberCommittedAssignment));
  // Stars and practice records saved in another tab appear here too.
  keep(subscribeToStorageKey(window, LIBRARY_STORAGE_KEY, () => practiceLibrary.reload()));
  keep(shareController.subscribe(reportLinkError));

  // First assignment: a shared link, else the last one practised here, else the
  // default preset. A link that cannot be opened is reported after the fallback
  // has loaded, so its explanation is the last thing said.
  const link = shareController.openLocation();
  if (!link.opened && !openInputs(practiceLibrary.lastInputs())) {
    const initialPresetId = state.inputs.presetId || DEFAULT_PRESET_ID;
    // Opening the app is not news: the first assignment is built without an announcement.
    if (initialPresetId) {
      applyPreset(initialPresetId, { announce: false });
    } else {
      applyAssignmentDraft(state.inputs, { announce: false });
    }
  }
  reportLinkError(link);

  keep(startMidiPlayThrough());
  offlineSupport = createOfflineSupport({
    production,
    document,
    events: window,
    serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
    // In the production bundle this is the hashed application chunk, which a
    // waiting service worker can recognise as already running or not.
    currentScriptUrl: import.meta.url,
    reload: () => window.location.reload(),
  });
  keep(() => offlineSupport.dispose());
  keep(announceOfflineReadiness(offlineSupport));
  const bridge = createCoachBridge();
  const unmountCoach = mountCoach(bridge);
  keep(() => {
    unmountCoach();
    bridge.dispose();
  });
}

/** Say once, on the visit that installs it, that the coach now opens without a connection. */
function announceOfflineReadiness(offline) {
  if (!("serviceWorker" in navigator) || navigator.serviceWorker.controller) return () => {};
  let announced = false;
  const announce = () => {
    if (announced || !offline.getSnapshot().offlineReady) return;
    // Wait rather than replace a message still being read, such as why a link failed.
    if (status.getSnapshot().transient) return;
    announced = true;
    status.show("Saved for offline use: this coach now opens without a connection.", {
      tone: "success",
      transient: true,
    });
  };
  const unsubscribeOffline = offline.subscribe(announce);
  const unsubscribeStatus = status.subscribe(announce);
  return () => {
    unsubscribeOffline();
    unsubscribeStatus();
  };
}

function keep(dispose) {
  if (typeof dispose === "function") runtimeDisposers.push(dispose);
  return dispose;
}

function teardown() {
  if (!initialized) return;
  stopAllPlayback();
  while (runtimeDisposers.length) runtimeDisposers.pop()();
  midiInput.disconnect();
  initialized = false;
}

/**
 * The coach is a React root layered over this application. It reads the
 * committed assignment and sampler status, and asks for audio unlock, through
 * this bridge rather than reaching into module state.
 */
function createCoachBridge() {
  const disposers = [];
  let cachedDerived = null;
  let cachedAssignment = null;
  let cachedSampler = getSamplerStatusSnapshot();
  const samplerListeners = new Set();
  disposers.push(
    onSamplerStatus((status) => {
      cachedSampler = status?.snapshot || getSamplerStatusSnapshot();
      samplerListeners.forEach((listener) => listener());
    }),
  );

  return {
    audioEngine,
    getAssignment() {
      // state.derived is replaced on every commit, so its identity is a
      // correct and cheap change signal for useSyncExternalStore.
      if (state.derived !== cachedDerived) {
        cachedDerived = state.derived;
        cachedAssignment = state.derived?.score
          ? {
              score: state.derived.score,
              scale: state.derived.scale,
              leftHand: state.derived.leftHand,
              motif: state.derived.motif,
            }
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
    observePlayback: (request) => testAdapter.setPlayback(request),
    reportError: (message) => status.show(message, { tone: "error" }),
    status,
    getKeyboardElement: () => dom.pianoVisual || null,
    noteInput,
    midiInput,
    setMidiPlayThrough,
    rerollIntoNewKey,
    assignmentEditor: createAssignmentEditor(disposers),
    soundSettings: createSoundSettings(),
    scaleAudition: createScaleAudition(),
    library: createCoachLibrary(),
    practiceHistory: createPracticeHistory(),
    offline: offlineSupport,
    dispose() {
      while (disposers.length) disposers.pop()();
      samplerListeners.clear();
    },
  };
}

/** Reactive state for the scale preview, which deliberately sits outside Score. */
function createScaleAudition() {
  const listeners = new Set();
  let snapshot = { playing: false, activeNote: null };
  const publish = (next) => {
    if (snapshot.playing === next.playing && snapshot.activeNote === next.activeNote) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const reset = () => publish({ playing: false, activeNote: null });
  resetScaleAudition = reset;

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async play(loop) {
      if (!ensureAssignmentReady() || !ensureSamplerReady()) return;
      if (!(await unlockAudio())) return;
      stopAllPlayback();
      publish({ playing: true, activeNote: null });
      await playScale(state.derived.scale, loop, {
        onNote: (note) => publish({ playing: true, activeNote: note }),
        onComplete: stopAllPlayback,
      });
      publishTransportState();
    },
    stop: stopAllPlayback,
  };
}

/** Sound state and commands for the React settings disclosure. */
function createSoundSettings() {
  const listeners = new Set();
  let cachedSignature = "";
  let cachedSnapshot = null;
  const publish = () => {
    cachedSignature = "";
    listeners.forEach((listener) => listener());
  };
  const change =
    (operation) =>
    (...args) => {
      operation(...args);
      publish();
    };

  return {
    getSnapshot() {
      const signature = JSON.stringify([state.tempo, state.mix, state.playback, state.fx]);
      if (!cachedSnapshot || signature !== cachedSignature) {
        cachedSignature = signature;
        cachedSnapshot = {
          tempoBpm: Number(state.tempo),
          mix: {
            left: { volumeDb: state.mix.left.volume, muted: state.mix.left.mute },
            lead: { volumeDb: state.mix.lead.volume, muted: state.mix.lead.mute },
          },
          humanize: {
            enabled: state.playback.humanizeEnabled,
            amountPercent: Math.round(state.playback.humanizeAmount * 100),
            swingPercent: Math.round(state.playback.swingAmount * 100),
          },
          effects: {
            reverbPercent: Math.round(state.fx.reverbWet * 100),
            largeRoom: state.fx.roomSizeLarge,
            motifWidthPercent: Math.round(state.fx.motifWidth * 100),
          },
        };
      }
      return cachedSnapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTempo: change(updateTempo),
    selectLibrary: handleLibrarySelect,
    playAll: handlePlayAll,
    stopAll: handleStopAll,
    setMixVolume: change(handleMixVolumeChange),
    setMixMuted: change(handleMixMuteChange),
    setHumanizeEnabled: change(handleHumanizeToggle),
    setHumanizeAmount: change(handleHumanizeAmount),
    setSwingAmount: change(handleSwingAmount),
    setReverb: change(handleReverbWetChange),
    setLargeRoom: change(handleRoomSizeToggle),
    setMotifWidth: change(handleMotifWidthChange),
  };
}

/** The React assignment workspace's typed view of assignment state and commands. */
function createAssignmentEditor(disposers) {
  const listeners = new Set();
  let cachedSignature = "";
  let cachedSnapshot = null;
  const publish = () => {
    cachedSignature = "";
    listeners.forEach((listener) => listener());
  };
  disposers.push(appStore.subscribe(publish));

  return {
    getSnapshot() {
      const inputs = state.assignment?.inputs ?? state.inputs;
      const signature = [
        state.assignment?.id ?? "",
        state.history.past.length,
        state.history.future.length,
        ...Object.values(state.locks).map(Number),
      ].join(":");
      if (!cachedSnapshot || signature !== cachedSignature) {
        cachedSignature = signature;
        cachedSnapshot = {
          inputs,
          locks: { ...state.locks },
          assignmentId: state.assignment?.id ?? null,
          seed: state.assignment?.seed ?? inputs.seed,
          canUndo: appStore.canUndo(),
          canRedo: appStore.canRedo(),
        };
      }
      return cachedSnapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply: applyAssignmentDraft,
    applyPreset,
    reroll: rerollAssignment,
    undo: undoAssignment,
    redo: redoAssignment,
    toggleLock(component) {
      toggleAssignmentLock(component);
      publish();
    },
  };
}

/** The coach's view of the practice library, tied to the committed assignment. */
function createCoachLibrary() {
  let cachedSnapshot = null;
  let cachedStarred = null;
  let cachedAssignment = null;
  const currentInputs = () => state.assignment?.inputs ?? null;

  return {
    getSnapshot() {
      const starred = practiceLibrary.starred();
      if (!cachedSnapshot || starred !== cachedStarred || state.assignment !== cachedAssignment) {
        cachedStarred = starred;
        cachedAssignment = state.assignment;
        const inputs = currentInputs();
        cachedSnapshot = { starred, currentStarred: inputs ? practiceLibrary.isStarred(inputs) : false };
      }
      return cachedSnapshot;
    },
    subscribe(listener) {
      const unsubscribeLibrary = practiceLibrary.subscribe(listener);
      const unsubscribeStore = appStore.subscribe(listener);
      return () => {
        unsubscribeLibrary();
        unsubscribeStore();
      };
    },
    currentShareUrl() {
      const inputs = currentInputs();
      return inputs ? shareController.currentShareUrl() : null;
    },
    currentTitle() {
      const inputs = currentInputs();
      return inputs ? assignmentTitle(inputs) : null;
    },
    toggleStarCurrent() {
      const inputs = currentInputs();
      if (inputs) practiceLibrary.toggleStar(inputs, assignmentTitle(inputs));
    },
    open(fragment) {
      const decoded = decodeShareFragment(fragment);
      if (!decoded.ok) return false;
      stopAllPlayback();
      return openInputs(decoded.inputs);
    },
    unstar: (fragment) => practiceLibrary.unstar(fragment),
    preferences: () => practiceLibrary.preferences(),
    setPreference: (name, value) => practiceLibrary.setPreference(name, value),
  };
}

/** Durable practice memory. The UI supplies observed session activity; MIDI is never treated as assessment. */
function createPracticeHistory() {
  let cachedRecords = null;
  let cachedRevisit = null;
  let cachedDay = null;
  let cachedSnapshot = null;
  let fallbackId = 0;
  let storageWarningShown = false;
  const records = () => practiceLibrary.practiceRecords();
  const find = (id) => records().find((record) => record.id === id) ?? null;
  const persist = (record) => {
    const stored = practiceLibrary.savePracticeRecord(record);
    if (!stored && !storageWarningShown) {
      storageWarningShown = true;
      status.show("Practice is continuing, but this browser could not save the latest history.", {
        tone: "error",
        transient: true,
        duration: 12000,
      });
    }
  };
  const nextId = () => {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `practice-${uuid}`;
    fallbackId += 1;
    return `practice-${Date.now().toString(36)}-${fallbackId}`;
  };

  return {
    getSnapshot() {
      const nextRecords = records();
      const revisit = practiceLibrary.preferences().revisitAfterDays;
      const day = new Date().toISOString().slice(0, 10);
      if (
        !cachedSnapshot ||
        nextRecords !== cachedRecords ||
        revisit !== cachedRevisit ||
        day !== cachedDay
      ) {
        cachedRecords = nextRecords;
        cachedRevisit = revisit;
        cachedDay = day;
        cachedSnapshot = {
          records: nextRecords,
          recommendation: recommendPractice(nextRecords, new Date(), revisit),
          revisitAfterDays: revisit,
        };
      }
      return cachedSnapshot;
    },
    subscribe: (listener) => practiceLibrary.subscribe(listener),
    beginCurrent(resumeId) {
      if (resumeId) {
        const existing = find(resumeId);
        if (existing?.status === "incomplete") return existing;
      }
      const inputs = state.assignment?.inputs;
      if (!inputs) return null;
      const record = createPracticeRecord({
        id: nextId(),
        fragment: encodeShareFragment(inputs),
        title: assignmentTitle(inputs),
        tempo: Number(state.tempo),
        startedAt: new Date(),
      });
      persist(record);
      return record;
    },
    update(id, activity) {
      const record = find(id);
      if (record?.status === "incomplete") persist(updatePracticeProgress(record, activity));
    },
    finish(id, practiceStatus, activity) {
      const record = find(id);
      if (record?.status === "incomplete")
        persist(finishPracticeRecord(record, practiceStatus, new Date(), activity));
    },
    annotate(id, fields) {
      const record = find(id);
      if (record) persist(updatePracticeProgress(record, fields));
    },
    open(id, options = {}) {
      const record = find(id);
      if (!record) return false;
      const decoded = decodeShareFragment(record.assignment.fragment);
      if (!decoded.ok) return false;
      stopAllPlayback();
      if (!openInputs(decoded.inputs)) return false;
      return options.newKey ? rerollIntoNewKey() : true;
    },
    delete: (id) => practiceLibrary.deletePracticeRecord(id),
    clear: () => practiceLibrary.clearPracticeHistory(),
    exportJson: () => practiceLibrary.exportPracticeHistory(),
    importJson: (source) => practiceLibrary.importPracticeHistory(source),
    setRevisitAfterDays: (days) => practiceLibrary.setPreference("revisitAfterDays", days),
  };
}

/** "A minor blues · 12-Bar Minor Blues · Blues Riff - minor blues ♭5" */
function assignmentTitle(inputs) {
  const mode = (SCALE_PATTERNS[inputs.mode]?.label ?? inputs.mode).toLowerCase();
  const progression =
    inputs.progressionPresetId === "custom"
      ? "custom progression"
      : (getProgressionPreset(inputs.progressionPresetId)?.label ?? inputs.progressionPresetId);
  const motif =
    inputs.motifId === "none" ? "no motif" : (MOTIF_STYLES[inputs.motifId]?.label ?? inputs.motifId);
  return `${inputs.key} ${mode} · ${progression} · ${motif}`;
}

function updateTempo(value) {
  state.tempo = value;
  audioEngine.setTempo(Number(value));
  practiceLibrary.rememberTempo(Number(value));
}

/**
 * Open an assignment from its inputs (a share link or a star). It goes through the
 * same learner-facing generation as the controls; if it cannot be built, the
 * current assignment stays.
 * @returns {boolean} whether it was opened
 */
function openInputs(inputs) {
  if (!inputs) return false;
  const previous = state.inputs;
  state.inputs = inputs;
  if (!computeDerived().ok) {
    state.inputs = previous;
    return false;
  }
  renderAll();
  return true;
}

function reportLinkError(result) {
  // Transient, so the sampler's ambient "ready" status waits its turn instead of
  // replacing the explanation while it is still being read.
  if (result.error) status.show(result.error, { tone: "error", transient: true, duration: 12000 });
}

function rememberCommittedAssignment() {
  const inputs = state.assignment?.inputs;
  if (!inputs) return;
  practiceLibrary.rememberInputs(inputs);
  shareController.rememberCurrent();
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
 * before adding any chord is the obvious one. Generation throws on those,
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
    status.hint(DRAFT_BLOCKED_MESSAGES[errors[0]] || `Can't build that yet: ${errors.join("; ")}`);
    return { ok: false, errors };
  }

  try {
    const assignment = generateLearnerAssignment(state.inputs);
    appStore.commitAssignment(assignment);
    updateAudioHumanize();
    return { ok: true, assignment };
  } catch (error) {
    // A pattern that undermines the chosen scale is not offered there. Say so and
    // keep the last assignment, rather than changing the pattern or its notes.
    if (error instanceof MotifNotOfferedError) {
      const variant = error.variant ? MOTIF_STYLES[error.variant] : null;
      status.hint(variant ? `${error.reason} Try ${variant.label}.` : error.reason);
      return { ok: false, errors: [error.message] };
    }
    // Validation passed but generation still failed: a real defect, not a draft.
    console.error("Assignment generation failed", error);
    status.show(`Could not build that assignment: ${error?.message || "unknown error"}`, {
      tone: "error",
    });
    return { ok: false, errors: [error?.message || "unknown error"] };
  }
}

/** Commit a complete draft from the React workspace, preserving the last valid assignment on failure. */
function applyAssignmentDraft(inputs, { announce = true } = {}) {
  const validation = validateAssignmentInputs(inputs);
  if (!validation.valid) {
    return {
      ok: false,
      message:
        DRAFT_BLOCKED_MESSAGES[validation.errors[0]] ||
        `Can't build that yet: ${validation.errors.join("; ")}.`,
    };
  }

  stopAllPlayback();
  const previousInputs = state.inputs;
  appStore.updateInputs(inputs);
  const result = computeDerived();
  if (!result.ok) {
    state.inputs = previousInputs;
    return { ok: false, message: result.errors?.[0] || "That assignment could not be built." };
  }

  renderAll();
  const preset = getProgressionPreset(state.inputs.progressionPresetId);
  const scaleLabel = state.derived.scale?.label
    ? `${state.inputs.key} ${state.derived.scale.label}`
    : state.inputs.key;
  const message = `Assignment updated for ${scaleLabel} · ${preset?.label || "Custom"} · ${state.derived.leftHand?.name || state.inputs.lhId} · ${state.derived.motif ? state.derived.motif.description : "No motif"}`;
  if (announce) status.show(message, { tone: "success", transient: true });
  return { ok: true, message };
}

function ensureAssignmentReady() {
  const ready = Boolean(state.derived?.progression && state.derived?.leftHand);
  if (!ready) {
    status.hint("Generate an assignment first to unlock playback.");
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
  status.hint("Piano samples are still loading. We'll let you know when they're ready.");
  return false;
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

  const unsubscribeNotes = noteInput.subscribe((event) => {
    if (event.source !== "midi") return;
    if (event.type === "noteOn") velocities.set(event.midi, event.velocity);
    held = reduceHeldNotes(held, event);
    sync();
  });
  const unsubscribeMidi = midiInput.subscribe(sync);
  return () => {
    unsubscribeNotes();
    unsubscribeMidi();
    sounding.forEach((_, midi) => playPreviewNoteUp(midiToNote(midi), { part: "lead" }));
    sounding = new Map();
  };
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

async function handlePlayAll(loopEnabled = false) {
  if (!ensureAssignmentReady() || !ensureSamplerReady()) {
    return;
  }
  if (!(await unlockAudio())) return;
  stopAllPlayback();
  applyPlayAllLoop(loopEnabled);
  playScoreParts(["lh", "rh"], loopEnabled);
  publishTransportState();
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
  resetScaleAudition();
  publishTransportState();
}

function publishTransportState() {
  testAdapter.setTransport(getTransportSnapshot().state);
}

function renderAll() {
  renderPianoDiatonic(dom, state.derived.scale);
}

/**
 * The same material in a different key: progression, groove and motif are kept,
 * and so is the mode - rerollAssignmentInputs changes key and mode together
 * unless the mode catalog is narrowed to the current one. The player's own lock
 * choices are not touched.
 */
function rerollIntoNewKey() {
  stopAllPlayback();
  const next = rerollAssignmentInputs(state.inputs, {
    locks: { key: false, harmony: true, groove: true, motif: true },
    catalog: { modes: [state.inputs.mode] },
  });
  appStore.updateInputs(next);
  if (!computeDerived().ok) return false;
  renderAll();
  return true;
}

function rerollAssignment() {
  if (["key", "harmony", "groove", "motif"].every((part) => state.locks[part])) {
    return { ok: false, message: "Unlock at least one part before rerolling." };
  }
  stopAllPlayback();
  appStore.reroll();
  const result = computeDerived();
  if (!result.ok) return { ok: false, message: result.errors?.[0] || "That variation could not be built." };
  renderAll();
  const shortId = state.assignment.id.replace(/^assignment-/, "");
  const message = `Created variation ${shortId} · locked parts were kept`;
  status.show(message, { tone: "success" });
  return { ok: true, message };
}

function undoAssignment() {
  stopAllPlayback();
  const assignment = appStore.undo();
  if (!assignment) return { ok: false, message: "There is no earlier assignment to restore." };
  renderAll();
  const message = "Restored the previous assignment";
  status.show(message, { tone: "info" });
  return { ok: true, message };
}

function redoAssignment() {
  stopAllPlayback();
  const assignment = appStore.redo();
  if (!assignment) return { ok: false, message: "There is no later assignment to restore." };
  renderAll();
  const message = "Restored the next assignment";
  status.show(message, { tone: "info" });
  return { ok: true, message };
}

function toggleAssignmentLock(component) {
  const locks = appStore.toggleLock(component);
  const label = component.charAt(0).toUpperCase() + component.slice(1);
  status.show(`${label} ${locks[component] ? "locked" : "unlocked"} for the next reroll`, {
    tone: "info",
  });
}

function handleMixVolumeChange(partId, value) {
  if (!MIX_PARTS.includes(partId)) return;
  const clamped = clampDb(value);
  state.mix[partId] = { ...state.mix[partId], volume: clamped };
  setMixSettings({ [partId]: state.mix[partId] });
}

function handleMixMuteChange(partId, mute) {
  if (!MIX_PARTS.includes(partId)) return;
  state.mix[partId] = { ...state.mix[partId], mute: !!mute };
  setMixSettings({ [partId]: state.mix[partId] });
}

function applyPreset(presetId, options) {
  const preset = getPresetConfig(presetId) || getPresetConfig(DEFAULT_PRESET_ID);
  if (!preset) return { ok: false, message: "That preset is not available." };
  return applyAssignmentDraft(
    {
      ...(state.assignment?.inputs ?? state.inputs),
      key: preset.key,
      mode: preset.mode,
      progressionPresetId: preset.progressionPresetId,
      styleId: preset.styleId,
      length: preset.length,
      lhId: preset.lhId,
      motifId: preset.motifId,
      presetId: preset.id,
    },
    options,
  );
}

function handleHumanizeToggle(enabled) {
  state.playback.humanizeEnabled = !!enabled;
  updateAudioHumanize();
}

function handleHumanizeAmount(value) {
  state.playback.humanizeAmount = clamp01(value / 100);
  updateAudioHumanize();
}

function handleSwingAmount(value) {
  state.playback.swingAmount = clamp01(value / 100);
  updateAudioHumanize();
}

function handleReverbWetChange(value) {
  state.fx.reverbWet = clamp01(value / 100);
  setReverbWet(state.fx.reverbWet);
}

function handleRoomSizeToggle(isLarge) {
  state.fx.roomSizeLarge = !!isLarge;
  setRoomSize(state.fx.roomSizeLarge ? "large" : "small");
}

function handleMotifWidthChange(value) {
  state.fx.motifWidth = clamp01(value / 100);
  setMotifWidth(state.fx.motifWidth);
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

function handleSamplerStatus(audioStatus = {}) {
  if (audioStatus.snapshot) {
    samplerSnapshot = audioStatus.snapshot;
  }
  testAdapter.setSampler(samplerSnapshot);
  if (audioStatus.phase === "error" || audioStatus.phase === "timeout") {
    const scope = audioStatus.label || (audioStatus.isDefault ? "Primary piano" : "Selected piano");
    const hint = audioStatus.isDefault ? "Trying backup piano" : "Select it again to retry";
    status.show(`${scope} error: ${audioStatus.error || "check connection"} · ${hint}`, {
      tone: "error",
    });
    if (audioStatus.isDefault) {
      requestFallbackPianoLoad("auto-error").catch((err) => console.warn("Auto fallback load failed", err));
    }
    return;
  }

  if (audioStatus.isDefault && audioStatus.phase === "ready") {
    status.show(`${audioStatus.label || "Piano"} ready for playback`, {
      ambient: true,
      tone: "success",
    });
    return;
  }

  if (!audioStatus.isDefault && audioStatus.phase === "ready") {
    status.show(`${audioStatus.label || "Piano"} ready · active`, {
      ambient: true,
      tone: "success",
    });
    return;
  }
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
  const targetLabel = getSamplerLabelById(libraryId);
  status.show(`${verb || "Switching"} ${targetLabel} samples…`, {
    ambient: true,
    tone: "info",
  });
  try {
    await requestLibraryLoad(libraryId);
  } catch (err) {
    console.error("Library load failed", err);
    status.show(`Unable to load ${targetLabel}: ${err?.message || err}`, {
      tone: "error",
    });
  } finally {
    librarySwitchPending = false;
  }
}

function getSamplerLabelById(libraryId) {
  return samplerSnapshot?.libraries?.[libraryId]?.label || "selected";
}

/** Start the composed browser application and return its complete lifecycle disposer. */
export function startApplication({ production = false } = {}) {
  init(production);
  return teardown;
}
