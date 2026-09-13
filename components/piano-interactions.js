// Framework-independent Live Piano focus, pointer and computer-key interactions.

import { noteStringToMidi } from "../theory.js";
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

export function cachePianoDom() {
  return {
    pianoVisual: document.getElementById("piano-visual"),
    pianoIndicatorRadios: document.querySelectorAll('input[name="piano-indicator-mode"]'),
    pianoGlissToggle: document.getElementById("piano-gliss-mode"),
    pianoComputerKeyboardToggle: document.getElementById("piano-computer-keyboard"),
    pianoChordMode: document.getElementById("piano-chord-mode"),
  };
}

function listen(disposers, target, type, listener) {
  if (!target) return;
  target.addEventListener(type, listener);
  disposers.push(() => target.removeEventListener(type, listener));
}

export function wirePianoInteractions(dom, handlers) {
  const disposers = [];
  dom.pianoIndicatorRadios?.forEach((radio) => {
    listen(disposers, radio, "change", () => {
      if (!radio.checked) return;
      dom.__pianoIndicatorMode = radio.value;
      handlers.onPianoIndicatorModeChange?.(radio.value);
    });
  });
  listen(disposers, dom.pianoGlissToggle, "change", (event) => {
    dom.__pianoGlissMode = event.target.checked;
    dom.pianoVisual?.classList.toggle("gliss-mode", event.target.checked);
    handlers.onPianoGlissModeChange?.(event.target.checked);
  });
  listen(disposers, dom.pianoChordMode, "change", (event) => {
    handlers.onPianoChordModeChange?.(event.target.value);
  });

  wireLivePianoInteractions(dom, handlers, disposers);
  return () => {
    while (disposers.length) disposers.pop()();
  };
}

function wireLivePianoInteractions(dom, handlers, disposers) {
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

  listen(disposers, dom.pianoVisual, "pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointerId = event.pointerId;
    if (dom.__pianoGlissMode) event.preventDefault();
    dom.pianoVisual.setPointerCapture?.(event.pointerId);
    pressPointerNote(noteAtEvent(event));
  });

  listen(disposers, dom.pianoVisual, "pointermove", (event) => {
    if (event.pointerId !== activePointerId || !dom.__pianoGlissMode) return;
    event.preventDefault();
    const note = noteAtEvent(event);
    if (note) pressPointerNote(note);
    else releasePointerNote();
  });

  listen(disposers, dom.pianoVisual, "pointerup", finishPointer);
  listen(disposers, dom.pianoVisual, "pointercancel", finishPointer);
  listen(disposers, dom.pianoVisual, "lostpointercapture", finishPointer);

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

  listen(disposers, dom.pianoVisual, "focusin", (event) => {
    const key = event.target.closest?.(".piano-key");
    if (key) setRovingKey(key);
  });

  listen(disposers, dom.pianoVisual, "keydown", (event) => {
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

  listen(disposers, dom.pianoVisual, "keyup", (event) => {
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

  listen(disposers, window, "keydown", (event) => {
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

  listen(disposers, window, "keyup", (event) => {
    const key = event.key.toLowerCase();
    const note = activeComputerKeys.get(key);
    if (!note) return;
    event.preventDefault();
    activeComputerKeys.delete(key);
    handlers.onPianoKeyUp?.(note, "computerKeyboard");
  });

  listen(disposers, window, "blur", () => {
    finishPointer();
    if (keyboardActivationNote) handlers.onPianoKeyUp?.(keyboardActivationNote, "screenKey");
    keyboardActivationNote = null;
    releaseComputerKeys();
  });

  listen(disposers, dom.pianoGlissToggle, "change", (event) => {
    if (!event.target.checked) finishPointer();
  });

  listen(disposers, dom.pianoComputerKeyboardToggle, "change", (event) => {
    dom.__pianoComputerKeyboardEnabled = event.target.checked;
    if (!event.target.checked) releaseComputerKeys();
    handlers.onPianoComputerKeyboardChange?.(event.target.checked);
  });

  disposers.push(() => {
    finishPointer();
    if (keyboardActivationNote) handlers.onPianoKeyUp?.(keyboardActivationNote, "screenKey");
    keyboardActivationNote = null;
    releaseComputerKeys();
  });
}
