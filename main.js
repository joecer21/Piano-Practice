import {
  PROGRESSION_PRESETS,
  STYLE_PALETTE_SETS,
  MOTIF_STYLES,
  getProgressionPreset,
  getStyleProfile,
} from "./theory.js";
import {
  generateScale,
  generateProgression,
  generateCustomProgression,
  generateLeftHandPattern,
  generateMotif,
  createPhrasePlan,
} from "./engine.js";
import { PRESET_CONFIGS, DEFAULT_PRESET_ID, getPresetConfig } from "./presets.js";
import {
  initSynths,
  isPianoLoaded,
  stopTransport,
  playScale,
  playLeftHand,
  playMotif,
  playAll,
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


const state = {
  tempo: 90,
  inputs: {
    key: "C",
    mode: "major",
    progressionPresetId: "pop-4",
    styleId: "pop",
    length: 8,
    lhId: "pop-8ths",
    motifId: "pop-hook-1351",
    customProgressionRoman: [],
    presetId: DEFAULT_PRESET_ID,
  },
  derived: {
    scale: null,
    progression: null,
    leftHand: null,
    motif: null,
  },
  mix: {
    left: { volume: 0, mute: false, pan: 0 },
    lead: { volume: 0, mute: false, pan: 0 },
  },
  playback: {
    humanizeEnabled: false,
    humanizeAmount: 0,
    swingAmount: 0,
  },
  fx: {
    reverbWet: 0,
    roomSizeLarge: false,
    motifWidth: 0,
  },
  ui: {
    mixCollapsed: true,
    advancedCollapsed: true,
  },
};

let samplerSnapshot = getSamplerStatusSnapshot();
if (typeof window !== "undefined") {
  window.__samplerSnapshot = samplerSnapshot;
}
let librarySwitchPending = false;
let playbackSession = null;
let playbackRafId = null;

const dom = {};

function init() {
  Object.assign(dom, cacheDom());
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
  initSynths().catch((err) => {
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
  });
  dom.playAllLoop?.addEventListener("change", handlePlayAllLoopToggle);
  updateLoopBadge(dom, dom.playAllLoop?.checked || false);

  window.addEventListener(
    "click",
    async () => {
      try {
        await Tone.start();
        console.log("Audio context started");
      } catch (err) {
        console.error("Error starting audio context:", err);
      }
    },
    { once: true }
  );
  const initialPresetId = state.inputs.presetId || DEFAULT_PRESET_ID;
  if (initialPresetId) {
    applyPreset(initialPresetId, { autoGenerate: true });
  } else {
    handleGenerate({ auto: true });
  }
}

function updateTempo(value) {
  state.tempo = value;
  Tone.Transport.bpm.value = value;
  setTempoValue(dom, value);
}

function resolveLength(rawLength, progressionPresetId) {
  const presetForLength = getProgressionPreset(progressionPresetId);
  const presetLength = presetForLength?.roman?.length || 4;
  if (!rawLength || Number.isNaN(rawLength)) return presetLength;
  return rawLength;
}

function computeDerived() {
  const inputs = state.inputs;
  const styleProfile = getStyleProfile(inputs.styleId);
  const scale = generateScale({ key: inputs.key, mode: inputs.mode });
  const effectiveLength = resolveLength(inputs.length, inputs.progressionPresetId);
  const presetConfig = getPresetConfig(state.inputs.presetId);
  const progression =
    inputs.progressionPresetId === "custom" && inputs.customProgressionRoman.length > 0
      ? generateCustomProgression(inputs.key, inputs.customProgressionRoman, scale, inputs.mode, styleProfile)
      : generateProgression(
          {
            key: inputs.key,
            mode: inputs.mode,
            length: effectiveLength,
            progressionPresetId: inputs.progressionPresetId,
          },
          scale,
          styleProfile
        );

  const phrasePlan = createPhrasePlan({
    key: inputs.key,
    mode: inputs.mode,
    styleId: inputs.styleId,
    motifPatternId: inputs.motifId,
    leftHandPatternId: inputs.lhId,
    anchors: presetConfig?.anchors,
  });

  const leftHand = generateLeftHandPattern(
    { leftHand: inputs.lhId, difficulty: "intermediate", styleId: inputs.styleId, phrasePlan },
    progression,
    state.inputs.mode
  );
  const motif =
    inputs.motifId === "none"
      ? null
      : generateMotif({ motifPatternId: inputs.motifId, styleId: inputs.styleId, phrasePlan }, scale);

  state.derived = { scale, progression, leftHand, motif, styleProfile, phrasePlan };
  updateAudioHumanize();
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

function handleGenerate(options = {}) {
  const { auto = false } = options;
  syncInputsFromDom();

  if (
    state.inputs.progressionPresetId === "custom" &&
    state.inputs.customProgressionRoman.length === 0
  ) {
    state.inputs.progressionPresetId = PROGRESSION_PRESETS[0].id;
    if (dom.progressionSelect) dom.progressionSelect.value = state.inputs.progressionPresetId;
    toggleCustomCard(dom, false);
    updateGenerateButtonLabel(dom, false);
    showHint(dom, "Add at least one chord to use your custom palette.");
    if (dom.customPreview) {
      pulseElement(dom.customPreview, "status");
    }
  }

  computeDerived();
  renderAll();
  syncPlayButtonsAvailability();

  const preset = getProgressionPreset(state.inputs.progressionPresetId);
  const scaleLabel = state.derived.scale?.label
    ? `${state.inputs.key} ${state.derived.scale.label}`
    : state.inputs.key;
  const status = `Assignment updated for ${scaleLabel} · ${preset?.label || "Custom"} · ${state.derived.leftHand?.name || state.inputs.lhId} · ${state.derived.motif ? state.derived.motif.description : "No motif"}`;
  setStatusMessage(dom, status, { tone: "success" });
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
  computeDerived();
  renderAll();
  renderProgressionPresetInfo(dom, getProgressionPreset(id), getStyleProfile(state.inputs.styleId), state.derived.progression);
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
  await Tone.start();
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
      playLeftHand(state.derived.leftHand, totalBeats, loopEnabled);
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
      playLeftHand(state.derived.leftHand, totalBeats, loopEnabled);
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
      playMotif(motif, loopEnabled);
      const motifBeats = motif.totalBeats || 0;
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

async function handlePlayAll() {
  if (!ensureAssignmentReady() || !ensureSamplerReady()) {
    return;
  }
  await Tone.start();
  stopAllPlayback();
  const loopEnabled = dom.playAllLoop?.checked || false;
  updateLoopBadge(dom, loopEnabled);
  applyPlayAllLoop(loopEnabled);
  playAll(
    {
      progression: state.derived.progression,
      leftHand: state.derived.leftHand,
      motif: state.derived.motif,
    },
    loopEnabled
  );
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
  stopPlaybackVisuals();
  highlightScaleNote(dom, null);
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
  const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (cb) => setTimeout(cb, 1000 / 60);
  playbackRafId = raf(() => updatePlaybackVisuals());
}

function updatePlaybackVisuals() {
  if (!playbackSession) return;
  const isRunning = Tone.Transport.state === "started";
  if (!isRunning) {
    stopPlaybackVisuals();
    return;
  }

  const beatsElapsed = getTransportBeats();
  const {
    totalBeats,
    loopEnabled,
    showPianoRoll,
    showProgression,
    showLeftHand,
    showMotif,
    motifBeats,
  } = playbackSession;
  if (!totalBeats || !Number.isFinite(beatsElapsed)) {
    resetPlaybackIndicators(dom);
    schedulePlaybackVisualTick();
    return;
  }

  const normalizedBeats = loopEnabled
    ? beatsElapsed % totalBeats
    : Math.min(beatsElapsed, totalBeats);
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
  const position = Tone.Transport.position;
  if (typeof position === "number") {
    return position;
  }
  if (typeof position === "string") {
    const [bars = 0, beats = 0, sixteenths = 0] = position.split(":");
    const numericBars = Number(bars) || 0;
    const numericBeats = Number(beats) || 0;
    const numericSixteenths = Number(sixteenths) || 0;
    return numericBars * 4 + numericBeats + numericSixteenths / 4;
  }
  if (position && typeof position.toSeconds === "function") {
    const seconds = position.toSeconds();
    const bpm = Tone.Transport.bpm?.value || state.tempo || 60;
    return (seconds * bpm) / 60;
  }
  return 0;
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
  renderProgression(state, dom, getProgressionPreset);
  renderLeftHand(state, dom);
  renderMotif(state, dom);
  renderPianoRoll(state, dom);
  renderCustomProgressionPreview(state, dom);
  renderProgressionPresetInfo(
    dom,
    getProgressionPreset(state.inputs.progressionPresetId),
    state.derived.styleProfile || getStyleProfile(state.inputs.styleId),
    state.derived.progression
  );
  updateCustomHeaderCount(dom, state.inputs.customProgressionRoman.length);
  renderMixControls(dom, state.mix);
  renderHumanizeControls(dom, state.playback);
  renderSpatialControls(dom, state.fx);
  syncPlayButtonsAvailability();
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
    const hint = status.isDefault
      ? "Trying backup piano"
      : "Select it again to retry";
    setStatusMessage(dom, `${scope} error: ${status.error || "check connection"} · ${hint}`, {
      tone: "error",
    });
    if (status.isDefault) {
      requestFallbackPianoLoad("auto-error").catch((err) =>
        console.warn("Auto fallback load failed", err)
      );
    }
    return;
  }

  if (status.isDefault && status.phase === "ready") {
    setStatusMessage(dom, `${status.label || "Piano"} ready for playback`, {
      tone: "success",
    });
    syncPlayButtonsAvailability();
    return;
  }

  if (!status.isDefault && status.phase === "ready") {
    setStatusMessage(dom, `${status.label || "Piano"} ready · active`, {
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
