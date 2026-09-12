import { noteStringToMidi } from "../theory.js";

const NOTE_ORDER = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SHARP_TO_FLAT = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
const FLAT_TO_SHARP = Object.fromEntries(Object.entries(SHARP_TO_FLAT).map(([sharp, flat]) => [flat, sharp]));
const DESKTOP_RANGE = Object.freeze({ start: "C2", end: "E6" });
const PHONE_RANGE = Object.freeze({ start: "C3", end: "C5" });
const PHONE_MEDIA_QUERY = "(max-width: 600px)";

function normalizeNoteId(note) {
  const match = String(note || "")
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return "";
  return `${match[1].toUpperCase()}${match[2]}${match[3]}`;
}

function noteRange(start = "C2", end = "E6") {
  const startMidi = noteStringToMidi(start);
  const endMidi = noteStringToMidi(end);
  const notes = [];
  for (let midi = startMidi; midi <= endMidi; midi += 1) {
    const octave = Math.floor(midi / 12) - 1;
    notes.push(`${NOTE_ORDER[((midi % 12) + 12) % 12]}${octave}`);
  }
  return notes;
}

function getEnharmonicEquivalent(note) {
  const match = normalizeNoteId(note).match(/^([A-G])([#b])(-?\d+)$/);
  if (!match) return null;
  const [, letter, accidental, octave] = match;
  const pitch = `${letter}${accidental}`;
  const alias = accidental === "#" ? SHARP_TO_FLAT[pitch] : FLAT_TO_SHARP[pitch];
  return alias ? `${alias}${octave}` : null;
}

function getPianoDimensions() {
  const fallback = { whiteWidth: 28, blackWidth: 18, whiteHeight: 112, blackHeight: 72 };
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const styles = window.getComputedStyle(document.documentElement);
  const read = (name, fallbackValue) => {
    const value = Number.parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallbackValue;
  };
  return {
    whiteWidth: read("--piano-white-width", fallback.whiteWidth),
    blackWidth: read("--piano-black-width", fallback.blackWidth),
    whiteHeight: read("--piano-white-height", fallback.whiteHeight),
    blackHeight: read("--piano-black-height", fallback.blackHeight),
  };
}

function registerKey(keyMap, note, element) {
  keyMap.set(note, element);
  const alias = getEnharmonicEquivalent(note);
  if (alias) keyMap.set(alias, element);
}

function resolveKey(dom, note) {
  const normalized = normalizeNoteId(note);
  if (!normalized) return null;
  return (
    dom.__pianoKeyMap?.get(normalized) || dom.__pianoKeyMidiMap?.get(noteStringToMidi(normalized)) || null
  );
}

function partClass(part) {
  return part === "left" || part === "lh" ? "lh" : "rh";
}

function shouldHighlight(mode, part) {
  if (mode === "lh") return partClass(part) === "lh";
  if (mode === "rh") return partClass(part) === "rh";
  return true;
}

function responsivePianoRange(compact) {
  const useCompactRange =
    typeof compact === "boolean"
      ? compact
      : typeof window !== "undefined" && window.matchMedia?.(PHONE_MEDIA_QUERY).matches;
  return useCompactRange ? PHONE_RANGE : DESKTOP_RANGE;
}

export function buildPianoVisual(dom, options = {}) {
  const container = dom?.pianoVisual;
  if (!container) return;

  container.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "piano-keys";

  const range = responsivePianoRange(options.compact);
  const notes = noteRange(options.start || range.start, options.end || range.end);
  const whiteNotes = notes.filter((note) => !note.includes("#"));
  const blackNotes = notes.filter((note) => note.includes("#"));
  const { whiteWidth, blackWidth, whiteHeight, blackHeight } = getPianoDimensions();
  const totalWidth = whiteNotes.length * whiteWidth;
  const whitePositions = new Map();
  const keyMap = new Map();

  whiteNotes.forEach((note, index) => {
    const key = createKey(note, "white", note === "C4");
    const left = index * whiteWidth;
    key.style.left = `${left}px`;
    key.style.width = `${whiteWidth}px`;
    key.style.height = `${whiteHeight}px`;
    wrapper.appendChild(key);
    whitePositions.set(note, left);
    registerKey(keyMap, note, key);
  });

  blackNotes.forEach((note) => {
    const key = createKey(note, "black", note === "C4");
    const midi = noteStringToMidi(note);
    const previousWhite = noteRangeFromMidi(midi - 1);
    const nextWhite = noteRangeFromMidi(midi + 1);
    const boundary = whitePositions.has(previousWhite)
      ? whitePositions.get(previousWhite) + whiteWidth
      : whitePositions.get(nextWhite) || 0;
    key.style.left = `${boundary - blackWidth / 2}px`;
    key.style.width = `${blackWidth}px`;
    key.style.height = `${blackHeight}px`;
    wrapper.appendChild(key);
    registerKey(keyMap, note, key);
  });

  wrapper.style.width = `${totalWidth}px`;
  wrapper.style.height = `${whiteHeight}px`;
  container.appendChild(wrapper);
  container.classList.toggle("gliss-mode", !!dom.__pianoGlissMode);
  container.dataset.rangeStart = notes[0] || "";
  container.dataset.rangeEnd = notes.at(-1) || "";
  dom.__pianoKeyMap = keyMap;
  dom.__pianoKeyMidiMap = new Map();
  keyMap.forEach((element, note) => {
    const midi = noteStringToMidi(note);
    if (!dom.__pianoKeyMidiMap.has(midi)) dom.__pianoKeyMidiMap.set(midi, element);
  });
}

function createKey(note, color, initialTabStop = false) {
  const key = document.createElement("button");
  key.type = "button";
  key.className = `piano-key ${color}`;
  key.dataset.note = note;
  key.setAttribute("aria-label", `${note} piano key`);
  key.setAttribute("aria-pressed", "false");
  key.tabIndex = initialTabStop ? 0 : -1;
  return key;
}

function noteRangeFromMidi(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_ORDER[((midi % 12) + 12) % 12]}${octave}`;
}

export function clearPianoHighlights(dom) {
  dom?.__pianoHighlightTimers?.forEach((timer) => clearTimeout(timer));
  dom?.__pianoHighlightTimers?.clear();
  dom?.__pianoKeyMap?.forEach((key) => {
    key.classList.remove("active", "lh", "rh");
    key.setAttribute("aria-pressed", "false");
  });
}

export function attachPianoNoteListeners(dom) {
  if (typeof window === "undefined" || !dom?.pianoVisual) return () => {};
  const timers = new Map();
  dom.__pianoHighlightTimers = timers;

  const deactivate = (note) => {
    const key = resolveKey(dom, note);
    if (!key) return;
    const timer = timers.get(note);
    if (timer) clearTimeout(timer);
    timers.delete(note);
    key.classList.remove("active", "lh", "rh");
    key.setAttribute("aria-pressed", "false");
  };

  const onPlay = (event) => {
    const { note, part, duration } = event.detail || {};
    if (!note || !shouldHighlight(dom.__pianoIndicatorMode, part)) return;
    const key = resolveKey(dom, note);
    if (!key) return;
    deactivate(note);
    key.classList.add("active", partClass(part));
    key.setAttribute("aria-pressed", "true");
    if (Number.isFinite(duration) && duration > 0) {
      timers.set(
        note,
        setTimeout(() => deactivate(note), duration * 1000),
      );
    }
  };

  const onStop = (event) => deactivate(event.detail?.note);
  const onStopAll = () => clearPianoHighlights(dom);
  window.addEventListener("note-play", onPlay);
  window.addEventListener("note-stop", onStop);
  window.addEventListener("notes-stop-all", onStopAll);

  return () => {
    window.removeEventListener("note-play", onPlay);
    window.removeEventListener("note-stop", onStop);
    window.removeEventListener("notes-stop-all", onStopAll);
    clearPianoHighlights(dom);
  };
}

export function renderPianoDiatonic(dom, scale) {
  const pitchClasses = new Set(
    (scale?.notes || []).map((note) => ((noteStringToMidi(`${note}4`) % 12) + 12) % 12),
  );
  dom?.__pianoKeyMap?.forEach((key, note) => {
    const pitchClass = ((noteStringToMidi(note) % 12) + 12) % 12;
    key.classList.toggle("nondiatonic", pitchClasses.size > 0 && !pitchClasses.has(pitchClass));
  });
}
