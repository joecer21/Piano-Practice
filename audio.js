// audio.js
// Playback helpers and Tone.js wiring.

import * as Tone from "tone";
import { LOCAL_SAMPLE_BASE_URL, LOCAL_VH_URL_MAP, LOCAL_VL_URL_MAP } from "./audio/local-samples.js";
import { createAudioEngine } from "./audio/playback-engine.js";

import { beatsToTransport, midiToNote, noteToMidi, NOTE_TO_INDEX } from "./theory.js";
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

  triggerAttack(note, time, velocity = 0.5) {
    const sampler = this._selectLayer(velocity);
    sampler?.triggerAttack(note, time, velocity);
  }

  triggerRelease(note, time) {
    Object.values(this.layers).forEach((sampler) => sampler?.triggerRelease(note, time));
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
const DEFAULT_LIBRARY_ID = LOCAL_LIBRARY_ID;
const FALLBACK_LIBRARY_ID = "salamander-lite";
const FALLBACK_LOAD_TIMEOUT_MS = 15000;

function dispatchNoteEvent(type, detail = {}) {
  if (typeof window === "undefined" || typeof window.CustomEvent !== "function") return;
  window.dispatchEvent(new window.CustomEvent(type, { detail }));
}
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
    isDefault: false,
  },
  [LOCAL_LIBRARY_ID]: {
    id: LOCAL_LIBRARY_ID,
    label: "Piano Lite - Soft",
    baseUrl: LOCAL_SAMPLE_BASE_URL,
    urls: LOCAL_VL_URL_MAP,
    isDefault: true,
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

// Tone.Transport.schedule returns an id for the event it created. Every one of
// those was discarded, so the only way to cancel anything was the global
// Tone.Transport.cancel() inside stopTransport - a part could not be stopped
// without stopping everything, and re-playing a part without an intervening stop
// stacked a duplicate copy of it onto the transport.
//
// Scale audition remains a short UI preview rather than Score playback. Keep
// ownership of those preview events separate from AudioEngine sessions.
const scheduledEventIds = { left: [], lead: [] };

function trackScheduledEvent(partId, eventId) {
  (scheduledEventIds[partId] ||= []).push(eventId);
}

function clearScheduledEvents(partId) {
  const ids = scheduledEventIds[partId];
  if (!ids?.length) return;
  ids.forEach((eventId) => {
    try {
      Tone.Transport.clear(eventId);
    } catch (err) {
      console.warn(`Failed to clear scheduled ${partId} event`, err);
    }
  });
  ids.length = 0;
}

function clearAllScheduledEvents() {
  Object.keys(scheduledEventIds).forEach(clearScheduledEvents);
}
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

const reverbState = { wet: FX_DEFAULTS.reverbWet, roomSize: FX_DEFAULTS.roomSize };
let motifWidthState = FX_DEFAULTS.motifWidth;
let fallbackLoadPromise = null;
let reverbSendEnabled = false;

let humanizeContext = createHumanizeContext();
let playbackTempoBpm = 90;
let masterLimiter = null;
let sharedReverb = null;
let motifWidthNode = null;

export function isPianoLoaded() {
  return pianoLoaded;
}

/** Dispose a Tone node without letting a teardown failure abort the rest. */
function disposeNode(node, label) {
  if (!node) return;
  try {
    if (typeof node.disconnect === "function") node.disconnect();
  } catch (err) {
    console.warn(`Failed to disconnect ${label}`, err);
  }
  try {
    if (typeof node.dispose === "function") node.dispose();
  } catch (err) {
    console.warn(`Failed to dispose ${label}`, err);
  }
}

/**
 * Tear the whole audio graph down. Without this, initSynths could only ever be
 * called once safely: a second call replaced masterLimiter and sharedReverb with
 * new nodes while the previous pair stayed connected to the destination.
 */
export function disposeAudio() {
  stopTransport();
  PART_IDS.forEach((partId) => {
    disposeNode(synths[partId], `${partId} sampler`);
    delete synths[partId];
  });
  Object.keys(channels).forEach((partId) => {
    disposeNode(channels[partId], `${partId} channel`);
    delete channels[partId];
  });
  disposeMotifWidthNode();
  disposeNode(sharedReverb, "shared reverb");
  sharedReverb = null;
  disposeNode(masterLimiter, "master limiter");
  masterLimiter = null;
  reverbSendEnabled = false;
  pianoLoaded = false;
}

export async function initSynths() {
  // Idempotent: rebuild from a known-empty graph rather than orphaning the
  // previous limiter and reverb.
  disposeAudio();
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
  emitSamplerStatus({ libraryId: FALLBACK_LIBRARY_ID, phase: "init", progress: 0, error: null, reason });
  if (activeLibraryId === FALLBACK_LIBRARY_ID) {
    return Promise.resolve(true);
  }
  if (fallbackLoadPromise) {
    return fallbackLoadPromise;
  }

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

const scorePartToAudioPart = { lh: "left", rh: "lead" };

const tonePlaybackDriver = {
  init() {
    return initSynths();
  },

  dispose() {
    disposeAudio();
  },

  configure({ tempoBpm, loop, loopStartBeat, loopEndBeat }) {
    playbackTempoBpm = tempoBpm;
    Tone.Transport.bpm.value = tempoBpm;
    Tone.Transport.loop = loop;
    Tone.Transport.loopStart = toToneTicks(loopStartBeat);
    Tone.Transport.loopEnd = loop ? toToneTicks(loopEndBeat) : 0;
    if (Tone.Transport.state !== "started") Tone.Transport.position = 0;
  },

  setTempo(tempoBpm) {
    playbackTempoBpm = tempoBpm;
    Tone.Transport.bpm.value = tempoBpm;
  },

  scheduleNote(group, onStart) {
    const humanizedSourceBeat = applyHumanizeToBeat(
      group.sourceStartBeat,
      humanizeContext,
      group.expression.swingWeight,
    );
    const humanizedBeat = Math.max(
      0,
      group.atBeat + (humanizedSourceBeat - group.sourceStartBeat) / group.rate,
    );
    return Tone.Transport.schedule((time) => {
      const partId = scorePartToAudioPart[group.part];
      const synth = synths[partId];
      if (!synth) return;
      const notes = group.midis.map((midi) => midiToNote(midi));
      const baseVelocity = scaleVelocityByDynamics(BASE_VELOCITIES[partId], group.expression);
      const velocity = getHumanizedVelocity(baseVelocity, humanizeContext);
      const durationSeconds = (group.durationBeats * 60) / playbackTempoBpm;
      onStart();
      notes.forEach((note) =>
        dispatchNoteEvent("note-play", { note, part: partId, duration: durationSeconds }),
      );
      synth.triggerAttackRelease(notes.length === 1 ? notes[0] : notes, durationSeconds, time, velocity);
    }, toToneTicks(humanizedBeat));
  },

  scheduleCountIn(atBeat, beatIndex, onStart) {
    return Tone.Transport.schedule((time) => {
      onStart();
      const synth = synths.lead || synths.left;
      if (!synth) return;
      synth.triggerAttackRelease("C6", 0.08, time, beatIndex === 0 ? 0.8 : 0.55);
    }, toToneTicks(atBeat));
  },

  scheduleEnd(atBeat, onEnd) {
    return Tone.Transport.schedule(onEnd, toToneTicks(atBeat));
  },

  clear(eventId) {
    Tone.Transport.clear(eventId);
  },

  start() {
    Tone.Transport.start();
  },

  stop() {
    stopToneTransport();
  },

  release(parts) {
    parts.forEach((part) => synths[scorePartToAudioPart[part]]?.releaseAll?.());
  },

  getSnapshot() {
    return {
      state: Tone.Transport.state,
      positionBeats: readTransportPositionBeats(),
    };
  },
};

/** Canonical Score-driven playback boundary. */
export const audioEngine = createAudioEngine(tonePlaybackDriver);

export function startAudioContext() {
  return Tone.start();
}

export function getTransportSnapshot() {
  return audioEngine.getSnapshot();
}

export function stopTransport() {
  audioEngine.stopAll();
  Tone.Transport.cancel();
  clearAllScheduledEvents();
}

export function configureLoop(totalBeats, enabled) {
  const settings = getLoopSettings(totalBeats, enabled);
  Tone.Transport.loop = settings.shouldLoop;
  Tone.Transport.loopStart = settings.loopStart;
  Tone.Transport.loopEnd = settings.loopEnd;
}

export function playPreviewNoteDown(note, options = {}) {
  if (!note) return false;
  const part = options.part === "left" ? "left" : "lead";
  const synth = synths[part] || synths.lead || synths.left;
  if (!synth || typeof synth.triggerAttack !== "function") return false;
  const velocity =
    typeof options.velocity === "number" ? clamp(options.velocity, 0.05, 1) : BASE_VELOCITIES[part] || 0.85;
  synth.triggerAttack(note, undefined, velocity);
  dispatchNoteEvent("note-play", { note, part });
  return true;
}

export function playPreviewNoteUp(note, options = {}) {
  if (!note) return false;
  const part = options.part === "left" ? "left" : "lead";
  const synth = synths[part] || synths.lead || synths.left;
  if (!synth || typeof synth.triggerRelease !== "function") return false;
  synth.triggerRelease(note);
  dispatchNoteEvent("note-stop", { note, part });
  return true;
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

  clearScheduledEvents("lead");
  let beatCursor = 0;
  notes.forEach((note, index) => {
    const when = beatsToTransport(beatCursor);
    const eventId = Tone.Transport.schedule((eventTime) => {
      if (typeof options.onNote === "function") {
        options.onNote(note, index);
      }
      dispatchNoteEvent("note-play", {
        note,
        part: "lead",
        duration: Tone.Time("8n").toSeconds(),
      });
      synths.lead.triggerAttackRelease(note, "8n", eventTime);
    }, when);
    trackScheduledEvent("lead", eventId);
    beatCursor += 0.5;
  });
  configureLoop(beatCursor, loopEnabled);
  if (!loopEnabled && typeof options.onComplete === "function") {
    trackScheduledEvent(
      "lead",
      Tone.Transport.schedule(() => {
        options.onComplete();
      }, beatsToTransport(beatCursor)),
    );
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

function toToneTicks(beats) {
  return Tone.Ticks(Math.max(0, beats) * Tone.Transport.PPQ);
}

function stopToneTransport() {
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  Tone.Transport.loop = false;
  dispatchNoteEvent("notes-stop-all");
  PART_IDS.forEach((partId) => synths[partId]?.releaseAll?.());
}

function readTransportPositionBeats() {
  const position = Tone.Transport.position;
  if (typeof position === "number") return position;
  if (typeof position === "string") {
    const [bars = 0, beats = 0, sixteenths = 0] = position.split(":");
    return (Number(bars) || 0) * 4 + (Number(beats) || 0) + (Number(sixteenths) || 0) / 4;
  }
  if (position && typeof position.toTicks === "function") {
    return position.toTicks() / Tone.Transport.PPQ;
  }
  if (position && typeof position.toSeconds === "function") {
    return (position.toSeconds() * (Tone.Transport.bpm?.value || playbackTempoBpm)) / 60;
  }
  return 0;
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
    Object.entries(samplerStatusState).map(([id, status]) => [id, { ...status }]),
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
  const deduped = Array.from(
    new Map(urlEntries.map((entry) => [`${entry.baseUrl}|${entry.path}`, entry])).values(),
  );
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
  let loadFailed = false;

  const disposeFreshSamplers = () => {
    Object.entries(freshSamplers).forEach(([partId, sampler]) => {
      disposeNode(sampler, `${library.label} ${partId} sampler (abandoned load)`);
      delete freshSamplers[partId];
    });
  };

  try {
    await Promise.all(
      PART_IDS.map((partId) =>
        createSamplerForPart(partId, library).then(
          ({ sampler }) => {
            // Promise.all rejects immediately. A sibling load may still finish
            // afterward, so dispose that late success instead of orphaning it.
            if (loadFailed) {
              disposeNode(sampler, `${library.label} ${partId} sampler (late sibling load)`);
              return;
            }
            freshSamplers[partId] = sampler;
          },
          (error) => {
            loadFailed = true;
            disposeFreshSamplers();
            throw error;
          },
        ),
      ),
    );

    PART_IDS.forEach((partId) => {
      const sampler = freshSamplers[partId];
      const targetNode = getPartInputNode(partId);
      if (sampler && targetNode) {
        sampler.connect(targetNode);
      }
    });
  } catch (err) {
    loadFailed = true;
    disposeFreshSamplers();
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
      onerror: (err) => {
        // The caller never receives this sampler, so nothing else can dispose it.
        disposeNode(sampler, `${library.label} sampler (failed load)`);
        reject(err || new Error(`Sampler load failed for ${library.label}`));
      },
    });
  });
}

function createVelocityLayerSampler(partId, library) {
  const entries = Object.entries(library.velocityLayers || {});
  if (!entries.length) {
    return createSingleLayerSampler(partId, library);
  }
  return new Promise((resolve, reject) => {
    // Every sampler constructed here is owned by this promise until it settles.
    // Previously, if one layer errored the promise rejected while the layers that
    // had already loaded stayed alive and unreachable.
    const constructed = [];
    const loadedLayers = {};
    let remaining = entries.length;
    let settled = false;

    const failLoad = (err) => {
      if (settled) return;
      settled = true;
      constructed.forEach((node) => disposeNode(node, `${library.label} layer sampler (failed load)`));
      reject(err || new Error(`Sampler load failed for ${library.label}`));
    };

    entries.forEach(([layerName, layerConfig]) => {
      const sampler = new Tone.Sampler({
        urls: layerConfig.urls,
        baseUrl: layerConfig.baseUrl ?? library.baseUrl,
        release: 1,
        onload: () => {
          if (settled) {
            disposeNode(sampler, `${library.label} layer sampler (late load)`);
            return;
          }
          loadedLayers[layerName] = sampler;
          remaining -= 1;
          if (remaining === 0) {
            settled = true;
            resolve({ partId, sampler: new VelocityLayerSampler(loadedLayers) });
          }
        },
        onerror: (err) =>
          failLoad(err || new Error(`Sampler load failed for ${library.label} (${layerName})`)),
      });
      constructed.push(sampler);
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
