// audio.js
// Playback helpers and Tone.js wiring.

import {
  beatsToTransport,
  beatsToTone,
  noteToMidi,
  NOTE_TO_INDEX,
} from "./theory.js";
import {
  createHumanizeContext,
  applyHumanizeToBeat,
  getHumanizedVelocity,
  scaleVelocityByDynamics,
} from "./humanize.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

class VelocityLayerSampler {
  constructor(layers = {}) {
    this.layers = layers;
  }

  connect(node) {
    Object.values(this.layers).forEach((sampler) => sampler.connect(node));
    return node;
  }

  disconnect() {
    Object.values(this.layers).forEach((sampler) => {
      try {
        sampler.disconnect();
      } catch (err) {
        console.warn("Layer sampler disconnect warning", err);
      }
    });
  }

  dispose() {
    Object.values(this.layers).forEach((sampler) => {
      try {
        sampler.dispose();
      } catch (err) {
        console.warn("Layer sampler dispose warning", err);
      }
    });
  }

  releaseAll() {
    Object.values(this.layers).forEach((sampler) => {
      if (typeof sampler.releaseAll === "function") {
        sampler.releaseAll();
      }
    });
  }

  triggerAttackRelease(note, duration, time, velocity = 0.5) {
    const sampler = this._selectLayer(velocity);
    sampler?.triggerAttackRelease(note, duration, time, velocity);
  }

  _selectLayer(velocity = 0.5) {
    const high = this.layers.high;
    const low = this.layers.low || high;
    if (velocity >= ACCENT_VELOCITY_THRESHOLD && high) return high;
    return low || Object.values(this.layers)[0];
  }
}

export const synths = {
  left: null,
  lead: null,
};

let pianoLoaded = false;
const samplerListeners = new Set();
const ACCENT_VELOCITY_THRESHOLD = 0.98;
const FUHTON_LIBRARY_ID = "fuhton-piano";
const LOCAL_LIBRARY_ID = "local-soft";
const LOCAL_HIGH_LIBRARY_ID = "local-bright";
const DEFAULT_LIBRARY_ID = FUHTON_LIBRARY_ID;
const FALLBACK_LIBRARY_ID = "salamander-lite";
const FALLBACK_LOAD_TIMEOUT_MS = 15000;
const LOCAL_SAMPLE_BASE_URL = "samples/";
// Local anchor samples (vl = low velocity layer) captured across A/C/D#/F# pivots.
const FUHTON_URL_MAP = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  A1: "A1.mp3",
  C2: "C2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  E4: "E4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  E5: "E5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  A6: "A6.mp3",
  A7: "A7.mp3",
  C7: "C7.mp3",
  Ab1: "Ab1.mp3",
  Bb1: "Bb1.mp3",
  Bb2: "Bb2.mp3",
  Bb3: "Bb3.mp3",
  Bb4: "Bb4.mp3",
  Bb5: "Bb5.mp3",
  Ab2: "Ab2.mp3",
  Ab3: "Ab3.mp3",
  Ab4: "Ab4.mp3",
  Ab5: "Ab5.mp3",
  Ab6: "Ab6.mp3",
  Ab7: "Ab7.mp3",
  B0: "B0.mp3",
  B1: "B1.mp3",
  B2: "B2.mp3",
  B3: "B3.mp3",
  B4: "B4.mp3",
  B5: "B5.mp3",
  B6: "B6.mp3",
  B7: "B7.mp3",
  G1: "G1.mp3",
  G2: "G2.mp3",
  G3: "G3.mp3",
  G4: "G4.mp3",
  G5: "G5.mp3",
  F1: "F1.mp3",
  F2: "F2.mp3",
  F3: "F3.mp3",
  F4: "F4.mp3",
  F5: "F5.mp3",
  F6: "F6.mp3",
  F7: "F7.mp3",
  D1: "D1.mp3",
  D2: "D2.mp3",
  D3: "D3.mp3",
  D4: "D4.mp3",
  D5: "D5.mp3",
};

const LOCAL_VL_URL_MAP = {
  A0: "a0vl.mp3",
  A1: "a1vl.mp3",
  A2: "a2vl.mp3",
  A3: "a3vl.mp3",
  A4: "a4vl.mp3",
  A5: "a5vl.mp3",
  A6: "a6vl.mp3",
  A7: "a7vl.mp3",
  C2: "c2vl.mp3",
  C3: "c3vl.mp3",
  C4: "c4vl.mp3",
  C5: "c5vl.mp3",
  "D#3": "d%233vl.mp3",
  "D#4": "d%234vl.mp3",
  "F#2": "f%232vl.mp3",
  "F#3": "f%233vl.mp3",
};
// Bright accent samples (vh = high velocity layer) used for rare emphasis hits.
const LOCAL_VH_URL_MAP = {
  A0: "a0vh.mp3",
  A1: "a1vh.mp3",
  A3: "a3vh.mp3",
  A4: "a4vh.mp3",
  A5: "a5vh.mp3",
  A6: "a6vh.mp3",
  A7: "a7vh.mp3",
  B3: "b3vh.mp3",
  B4: "b4vh.mp3",
  B5: "b5vh.mp3",
  C2: "c2vh.mp3",
  C3: "c3vh.mp3",
  C5: "c5vh.mp3",
  "D#3": "d%233vh.mp3",
  "D#4": "d%234vh.mp3",
  "F#2": "f%232vh.mp3",
  "F#3": "f%233vh.mp3",
};
const SALAMANDER_URL_MAP = {
  A2: "A2.mp3",
  A3: "A3.mp3",
  A4: "A4.mp3",
  C1: "C1.mp3",
  C2: "C2.mp3",
  C3: "C3.mp3",
  C4: "C4.mp3",
  C5: "C5.mp3",
  C6: "C6.mp3",
};
const SAMPLE_LIBRARY_REGISTRY = {
  [FUHTON_LIBRARY_ID]: {
    id: FUHTON_LIBRARY_ID,
    label: "Fuhton Piano",
    baseUrl: "https://raw.githubusercontent.com/fuhton/piano-mp3/",
    urls: FUHTON_URL_MAP,
    velocityLayers: {
      low: { baseUrl: LOCAL_SAMPLE_BASE_URL, urls: LOCAL_VL_URL_MAP },
      high: { baseUrl: LOCAL_SAMPLE_BASE_URL, urls: LOCAL_VH_URL_MAP },
    },
    isDefault: true,
  },
  [LOCAL_LIBRARY_ID]: {
    id: LOCAL_LIBRARY_ID,
    label: "Piano Lite - Soft",
    baseUrl: LOCAL_SAMPLE_BASE_URL,
    urls: LOCAL_VL_URL_MAP,
    isDefault: false,
  },
  [LOCAL_HIGH_LIBRARY_ID]: {
    id: LOCAL_HIGH_LIBRARY_ID,
    label: "Piano HL - Bright",
    baseUrl: LOCAL_SAMPLE_BASE_URL,
    urls: LOCAL_VH_URL_MAP,
    isDefault: false,
  },
  [FALLBACK_LIBRARY_ID]: {
    id: FALLBACK_LIBRARY_ID,
    label: "Salamander Lite",
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    urls: SALAMANDER_URL_MAP,
    isDefault: false,
  },
};

let activeLibraryId = DEFAULT_LIBRARY_ID;

const samplerStatusState = {};
Object.values(SAMPLE_LIBRARY_REGISTRY).forEach((library) => {
  samplerStatusState[library.id] = {
    libraryId: library.id,
    label: library.label,
    isDefault: !!library.isDefault,
    phase: library.isDefault ? "idle" : "standby",
    progress: library.isDefault ? 0 : null,
    active: library.id === activeLibraryId,
    error: null,
  };
});
const libraryLoadPromises = {};
const PART_IDS = ["left", "lead"];
const DEFAULT_MIX = {
  left: { volume: 0, mute: false, pan: 0 },
  lead: { volume: 0, mute: false, pan: 0 },
};
const BASE_VELOCITIES = {
  left: 0.78,
  lead: 0.92,
};

const FX_DEFAULTS = {
  reverbWet: 0,
  roomSize: "small",
  motifWidth: 0,
};

const ROOM_SIZE_PRESETS = {
  small: { decay: 1.8, preDelay: 0.01 },
  large: { decay: 3.6, preDelay: 0.08 },
};

const mixState = {
  left: { ...DEFAULT_MIX.left },
  lead: { ...DEFAULT_MIX.lead },
};

const channels = {
  left: null,
  lead: null,
};

let reverbState = { wet: FX_DEFAULTS.reverbWet, roomSize: FX_DEFAULTS.roomSize };
let motifWidthState = FX_DEFAULTS.motifWidth;
let fallbackLoadPromise = null;
let reverbSendEnabled = false;

let humanizeContext = createHumanizeContext();
let masterLimiter = null;
let sharedReverb = null;
let motifWidthNode = null;

export function isPianoLoaded() {
  return pianoLoaded;
}

export async function initSynths() {
  masterLimiter = new Tone.Limiter(-1).toDestination();
  sharedReverb = new Tone.Reverb({
    ...getReverbConfig(reverbState.roomSize),
    wet: reverbState.wet,
  });
  sharedReverb.connect(masterLimiter);
  reverbSendEnabled = false;
  setupChannelsAndEffects();
  updateReverbRouting();
  pianoLoaded = false;

  try {
    await loadLibrary(DEFAULT_LIBRARY_ID);
  } catch (err) {
    console.error("Failed to load primary piano library", err);
    try {
      await loadLibrary(FALLBACK_LIBRARY_ID, { timeoutMs: FALLBACK_LOAD_TIMEOUT_MS });
    } catch (fallbackErr) {
      console.error("Failed to load fallback piano library", fallbackErr);
      throw fallbackErr;
    }
  }
}

export function getSamplerStatusSnapshot() {
  return buildSamplerSnapshot();
}

export function requestFallbackPianoLoad(reason = "manual") {
  if (activeLibraryId === FALLBACK_LIBRARY_ID) {
    return Promise.resolve(true);
  }
  if (fallbackLoadPromise) {
    return fallbackLoadPromise;
  }

  console.log(`Starting lite piano load (${reason})`);
  fallbackLoadPromise = loadLibrary(FALLBACK_LIBRARY_ID, { timeoutMs: FALLBACK_LOAD_TIMEOUT_MS })
    .catch((err) => {
      // loadLibrary already emitted detailed status; surface failure for callers.
      return Promise.reject(err);
    })
    .finally(() => {
      fallbackLoadPromise = null;
    });

  return fallbackLoadPromise;
}

export function requestLibraryLoad(libraryId, options = {}) {
  if (!libraryId) {
    return Promise.reject(new Error("Missing library id"));
  }
  if (libraryId === activeLibraryId && samplerStatusState[libraryId]?.phase === "ready") {
    return Promise.resolve(true);
  }
  return loadLibrary(libraryId, options);
}

export function stopTransport() {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.position = 0;
  Tone.Transport.loop = false;

  PART_IDS.forEach((partId) => {
    const synth = synths[partId];
    if (synth && typeof synth.releaseAll === "function") {
      synth.releaseAll();
    }
  });
}

export function configureLoop(totalBeats, enabled) {
  const settings = getLoopSettings(totalBeats, enabled);
  Tone.Transport.loop = settings.shouldLoop;
  Tone.Transport.loopStart = settings.loopStart;
  Tone.Transport.loopEnd = settings.loopEnd;
}

export function patternEventsFromLeftHand(leftHand) {
  const events = [];
  if (!leftHand || !leftHand.bars) return events;

  leftHand.bars.forEach((bar) => {
    bar.steps.forEach((step) => {
      const startBeats = step.time;
      events.push({
        startBeats,
        duration: step.duration || beatsToTone(step.beats || 1),
        note: step.note || null,
        notes: step.notes || null,
        dynamics: step.dynamics || null,
        swingPosition: step.swingPosition || 0,
      });
    });
  });

  return events;
}

export function patternEventsFromMotif(motif, options = {}) {
  const events = [];
  if (!motif || !motif.steps || !motif.steps.length) return events;

  const repeatToBeats = options.repeatToBeats || motif.totalBeats || 0;
  const motifLength = motif.totalBeats || 0;

  if (!repeatToBeats || !motifLength) {
    motif.steps.forEach((step) => {
      if (step.rest) return;
      events.push({
        startBeats: step.time,
        duration: step.duration,
        note: step.note,
        notes: null,
        dynamics: step.dynamics || null,
        swingPosition: step.swingPosition || 0,
      });
    });
    return events;
  }

  for (let offset = 0; offset < repeatToBeats; offset += motifLength) {
    motif.steps.forEach((step) => {
      if (step.rest) return;
      const when = offset + step.time;
      if (when >= repeatToBeats) return;
      events.push({
        startBeats: when,
        duration: step.duration,
        note: step.note,
        notes: null,
        dynamics: step.dynamics || null,
        swingPosition: step.swingPosition || 0,
      });
    });
  }

  return events;
}

export function schedulePatternEvents(events, synth, options = {}) {
  const partId = options.partId || "left";
  events.forEach((ev) => {
    const when = getHumanizedSeconds(ev.startBeats, ev.swingPosition);
    Tone.Transport.schedule((time) => {
      const baseVelocity = scaleVelocityByDynamics(BASE_VELOCITIES[partId], ev.dynamics);
      const velocity = getHumanizedVelocity(baseVelocity, humanizeContext);
      if (ev.notes && ev.notes.length) {
        synth.triggerAttackRelease(ev.notes, ev.duration, time, velocity);
      } else if (ev.note) {
        synth.triggerAttackRelease(ev.note, ev.duration, time, velocity);
      }
    }, when);
  });
}

export function playFromEvents(events, synth, loopBeats, loopEnabled, partId) {
  if (!events || !events.length) return;
  configureLoop(loopBeats, loopEnabled);
  schedulePatternEvents(events, synth, { partId });
  Tone.Transport.start();
}

export async function playScale(scale, loopEnabled, options = {}) {
  if (!scale) return;

  const rootNoteName = scale.notes[0];
  const midiC4 = noteToMidi("C", 4);
  const midiRoot4 = noteToMidi(rootNoteName, 4);
  const midiRoot3 = noteToMidi(rootNoteName, 3);
  let octave = Math.abs(midiRoot4 - midiC4) < Math.abs(midiRoot3 - midiC4) ? 4 : 3;

  const scaleWithOctave = [...scale.notes, scale.notes[0]];
  const notes = scaleWithOctave.map((note, i) => {
    if (i > 0 && NOTE_TO_INDEX[note] < NOTE_TO_INDEX[scaleWithOctave[i - 1]]) {
      octave++;
    }
    return `${note}${octave}`;
  });

  let beatCursor = 0;
  notes.forEach((note, index) => {
    const when = beatsToTransport(beatCursor);
    Tone.Transport.schedule((eventTime) => {
      if (typeof options.onNote === "function") {
        options.onNote(note, index);
      }
      synths.lead.triggerAttackRelease(note, "8n", eventTime);
    }, when);
    beatCursor += 0.5;
  });
  configureLoop(beatCursor, loopEnabled);
  if (!loopEnabled && typeof options.onComplete === "function") {
    Tone.Transport.schedule(() => {
      options.onComplete();
    }, beatsToTransport(beatCursor));
  }
  Tone.Transport.start();
}

export async function playLeftHand(leftHand, totalBeats, loopEnabled) {
  if (!leftHand) return;
  const events = patternEventsFromLeftHand(leftHand);
  playFromEvents(events, synths.left, totalBeats, loopEnabled, "left");
}

export async function playMotif(motif, loopEnabled) {
  if (!motif) return;
  const totalBeats = motif.totalBeats || 0;
  if (!totalBeats) return;
  const events = patternEventsFromMotif(motif);
  playFromEvents(events, synths.lead, totalBeats, loopEnabled, "lead");
}

export async function playAll({ progression, leftHand, motif }, loopEnabled) {
  if (!progression || !leftHand) return;
  stopTransport();

  const bars = progression.bars;
  const totalBars = bars.length;
  const totalBeats = totalBars * 4;
  configureLoop(totalBeats, loopEnabled);

  const lhEvents = patternEventsFromLeftHand(leftHand);
  schedulePatternEvents(lhEvents, synths.left, { partId: "left" });

  if (motif && motif.steps.length && motif.totalBeats > 0) {
    const motifEvents = patternEventsFromMotif(motif, { repeatToBeats: totalBeats });
    schedulePatternEvents(motifEvents, synths.lead, { partId: "lead" });
  }

  Tone.Transport.start();
}

export function setMixSettings(nextMix = {}) {
  Object.entries(nextMix).forEach(([partId, settings]) => {
    if (!mixState[partId]) return;
    mixState[partId] = { ...mixState[partId], ...settings };
    if (channels[partId]) {
      applyMixToChannel(partId);
    }
  });
}

export function setHumanizeSettings({ enabled, amount, swing, styleDefaults } = {}) {
  humanizeContext = createHumanizeContext({
    enabled,
    amount,
    swing,
    styleDefaults,
  });
}

export function setReverbWet(value = FX_DEFAULTS.reverbWet) {
  const wet = clamp(value, 0, 0.8);
  reverbState.wet = wet;
  if (sharedReverb) sharedReverb.wet.value = wet;
  updateReverbRouting();
}

export function setRoomSize(size = FX_DEFAULTS.roomSize) {
  const normalized = size === "large" ? "large" : "small";
  reverbState.roomSize = normalized;
  if (sharedReverb) {
    sharedReverb.set(getReverbConfig(normalized));
    sharedReverb.wet.value = reverbState.wet;
  }
  updateReverbRouting();
}

export function setMotifWidth(amount = FX_DEFAULTS.motifWidth) {
  motifWidthState = clamp(amount, 0, 1);
  const shouldEnable = motifWidthState > 0;
  const effectActive = !!motifWidthNode;

  if (shouldEnable && !effectActive) {
    ensureMotifWidthNode();
    reconnectLeadRouting();
  } else if (!shouldEnable && effectActive) {
    disposeMotifWidthNode();
    reconnectLeadRouting();
  }

  if (shouldEnable && motifWidthNode?.wet) {
    motifWidthNode.wet.value = motifWidthState;
  }
}

function ensureMotifWidthNode() {
  if (motifWidthNode) return;
  motifWidthNode = new Tone.Chorus(4, 0.25, 0.35).start();
  motifWidthNode.wet.value = motifWidthState;
  if (channels.lead) {
    motifWidthNode.connect(channels.lead);
  }
}

function disposeMotifWidthNode() {
  if (!motifWidthNode) return;
  motifWidthNode.disconnect();
  motifWidthNode.dispose();
  motifWidthNode = null;
}

function reconnectLeadRouting() {
  const leadSampler = synths.lead;
  if (!leadSampler) return;
  try {
    leadSampler.disconnect();
  } catch (err) {
    console.warn("Failed to disconnect lead sampler during routing change", err);
  }
  const target = getPartInputNode("lead");
  if (target) {
    leadSampler.connect(target);
  }
}

function getPartInputNode(partId) {
  if (partId === "lead" && motifWidthNode) {
    return motifWidthNode;
  }
  return channels[partId];
}

export function getLoopSettings(totalBeats, enabled) {
  const shouldLoop = !!enabled && totalBeats > 0;
  return {
    shouldLoop,
    loopStart: 0,
    loopEnd: shouldLoop ? beatsToTransport(totalBeats) : 0,
  };
}

export function onSamplerStatus(listener) {
  samplerListeners.add(listener);
  return () => samplerListeners.delete(listener);
}

function applyMixToChannel(partId) {
  const channel = channels[partId];
  const settings = mixState[partId];
  if (!channel || !settings) return;
  channel.volume.value = settings.volume;
  channel.pan.value = settings.pan || 0;
  channel.mute = !!settings.mute;
}

function getHumanizedSeconds(startBeats, swingPosition = 0) {
  const adjustedBeats = Math.max(0, applyHumanizeToBeat(startBeats, humanizeContext, swingPosition));
  const baseSeconds = Tone.Time(beatsToTransport(startBeats)).toSeconds();
  const beatDiff = adjustedBeats - startBeats;
  const secondsPerBeat = Tone.Time("4n").toSeconds();
  const humanized = baseSeconds + beatDiff * secondsPerBeat;
  return Math.max(0, humanized);
}

function getReverbConfig(size = FX_DEFAULTS.roomSize) {
  return ROOM_SIZE_PRESETS[size] || ROOM_SIZE_PRESETS.small;
}

function emitSamplerStatus(patch) {
  if (!patch || !patch.libraryId) return;
  const library = getLibraryConfig(patch.libraryId);
  const current = samplerStatusState[patch.libraryId] || {};
  const next = {
    ...current,
    label: library?.label || current.label,
    isDefault: library?.isDefault ?? current.isDefault,
    ...patch,
  };
  samplerStatusState[patch.libraryId] = next;
  const snapshot = buildSamplerSnapshot();
  samplerListeners.forEach((listener) => {
    try {
      listener({ ...next, snapshot });
    } catch (err) {
      console.error("Sampler status listener error", err);
    }
  });
}

function buildSamplerSnapshot() {
  const libraries = Object.fromEntries(
    Object.entries(samplerStatusState).map(([id, status]) => [id, { ...status }])
  );
  return {
    activeLibraryId,
    libraries,
  };
}

function setupChannelsAndEffects() {
  PART_IDS.forEach((partId) => {
    if (!channels[partId]) {
      channels[partId] = new Tone.Channel({
        volume: mixState[partId].volume,
        pan: mixState[partId].pan,
        mute: mixState[partId].mute,
      });
      channels[partId].connect(masterLimiter);
      if (partId === "lead" && motifWidthNode) {
        motifWidthNode.connect(channels[partId]);
      }
    }
  });
}

function updateReverbRouting() {
  if (!sharedReverb) return;
  const shouldSend = reverbState.wet > 0;
  if (shouldSend && !reverbSendEnabled) {
    PART_IDS.forEach((partId) => {
      if (!channels[partId]) return;
      try {
        channels[partId].connect(sharedReverb);
      } catch (err) {
        console.warn("Failed to enable reverb send", err);
      }
    });
    reverbSendEnabled = true;
    return;
  }
  if (!shouldSend && reverbSendEnabled) {
    PART_IDS.forEach((partId) => {
      if (!channels[partId]) return;
      try {
        channels[partId].disconnect(sharedReverb);
      } catch (err) {
        console.warn("Failed to disable reverb send", err);
      }
    });
    reverbSendEnabled = false;
  }
}

async function loadLibrary(libraryId, options = {}) {
  const library = getLibraryConfig(libraryId);
  if (!library) throw new Error(`Unknown piano library: ${libraryId}`);
  if (libraryLoadPromises[libraryId]) {
    return libraryLoadPromises[libraryId];
  }

  const abortController = options.timeoutMs ? new AbortController() : null;
  const task = (async () => {
    emitSamplerStatus({ libraryId, phase: "init", progress: 0, error: null });
    await prefetchLibrary(library, {
      signal: abortController?.signal,
      onProgress: (progress) => emitSamplerStatus({ libraryId, phase: "progress", progress }),
    });
    emitSamplerStatus({ libraryId, phase: "switching", progress: 1 });
    await swapSamplersForLibrary(library);
    setActiveLibrary(libraryId);
    pianoLoaded = true;
    emitSamplerStatus({ libraryId, phase: "ready", progress: 1, active: true, error: null });
    return true;
  })();

  const wrappedTask = options.timeoutMs
    ? withTimeout(task, options.timeoutMs, library, abortController)
    : task;

  libraryLoadPromises[libraryId] = wrappedTask
    .catch((err) => {
      const phase = err?.code === "TIMEOUT" ? "timeout" : "error";
      emitSamplerStatus({
        libraryId,
        phase,
        error: err?.message || "Unable to load samples",
        progress: 0,
        active: libraryId === activeLibraryId ? false : samplerStatusState[libraryId]?.active,
      });
      throw err;
    })
    .finally(() => {
      libraryLoadPromises[libraryId] = null;
    });

  return libraryLoadPromises[libraryId];
}

async function prefetchLibrary(library, { signal, onProgress } = {}) {
  const urlEntries = library.velocityLayers
    ? Object.values(library.velocityLayers).flatMap((layer) => {
        const layerBase = layer.baseUrl ?? library.baseUrl;
        return Object.values(layer.urls || {}).map((path) => ({ baseUrl: layerBase, path }));
      })
    : Object.values(library.urls || {}).map((path) => ({ baseUrl: library.baseUrl, path }));
  const deduped = Array.from(new Map(urlEntries.map((entry) => [`${entry.baseUrl}|${entry.path}`, entry])).values());
  if (!deduped.length) return;
  let loaded = 0;
  for (const entry of deduped) {
    const url = `${entry.baseUrl}${entry.path}`;
    const response = await fetch(url, { cache: "force-cache", signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${entry.path}`);
    }
    await response.arrayBuffer();
    loaded += 1;
    if (onProgress) onProgress(loaded / deduped.length);
  }
}

async function swapSamplersForLibrary(library) {
  const freshSamplers = {};
  try {
    const results = await Promise.all(
      PART_IDS.map((partId) => createSamplerForPart(partId, library))
    );
    results.forEach(({ partId, sampler }) => {
      freshSamplers[partId] = sampler;
      const targetNode = getPartInputNode(partId);
      if (targetNode) {
        sampler.connect(targetNode);
      }
    });
  } catch (err) {
    Object.values(freshSamplers).forEach((sampler) => {
      try {
        sampler.dispose();
      } catch (disposeErr) {
        console.warn("Failed to dispose sampler after error", disposeErr);
      }
    });
    throw err;
  }

  PART_IDS.forEach((partId) => {
    if (synths[partId]) {
      try {
        synths[partId].disconnect();
      } catch (err) {
        console.warn("Error disconnecting sampler", err);
      }
      synths[partId].dispose();
    }
    synths[partId] = freshSamplers[partId];
  });
}

function createSamplerForPart(partId, library) {
  if (library.velocityLayers) {
    return createVelocityLayerSampler(partId, library);
  }
  return createSingleLayerSampler(partId, library);
}

function createSingleLayerSampler(partId, library) {
  return new Promise((resolve, reject) => {
    const sampler = new Tone.Sampler({
      urls: library.urls,
      baseUrl: library.baseUrl,
      release: 1,
      onload: () => resolve({ partId, sampler }),
      onerror: (err) => reject(err || new Error(`Sampler load failed for ${library.label}`)),
    });
  });
}

function createVelocityLayerSampler(partId, library) {
  const entries = Object.entries(library.velocityLayers || {});
  if (!entries.length) {
    return createSingleLayerSampler(partId, library);
  }
  return new Promise((resolve, reject) => {
    const loadedLayers = {};
    let remaining = entries.length;
    entries.forEach(([layerName, layerConfig]) => {
      const sampler = new Tone.Sampler({
        urls: layerConfig.urls,
        baseUrl: layerConfig.baseUrl ?? library.baseUrl,
        release: 1,
        onload: () => {
          loadedLayers[layerName] = sampler;
          remaining -= 1;
          if (remaining === 0) {
            resolve({ partId, sampler: new VelocityLayerSampler(loadedLayers) });
          }
        },
        onerror: (err) => reject(err || new Error(`Sampler load failed for ${library.label} (${layerName})`)),
      });
    });
  });
}

function withTimeout(promise, timeoutMs, library, controller) {
  if (!timeoutMs) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (controller) controller.abort();
      const timeoutError = new Error(`Timed out loading ${library.label}`);
      timeoutError.code = "TIMEOUT";
      reject(timeoutError);
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function setActiveLibrary(libraryId) {
  activeLibraryId = libraryId;
  Object.keys(samplerStatusState).forEach((id) => {
    const shouldBeActive = id === libraryId;
    if (samplerStatusState[id]?.active === shouldBeActive) return;
    emitSamplerStatus({ libraryId: id, active: shouldBeActive });
  });
}

function getLibraryConfig(libraryId) {
  return SAMPLE_LIBRARY_REGISTRY[libraryId];
}

