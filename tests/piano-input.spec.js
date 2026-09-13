import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { buildPianoVisual } from "../components/piano.js";
import { QWERTY_PIANO_NOTES, wirePianoInteractions } from "../components/piano-interactions.js";

let environment;
let dom;
let onPianoKeyDown;
let onPianoKeyUp;
let disposeEvents;

function keyboardEvent(type, key, options = {}) {
  return new window.KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...options });
}

function pointerEvent(type, options = {}) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType || "touch" },
    button: { value: options.button ?? 0 },
  });
  return event;
}

beforeEach(() => {
  environment = new JSDOM(`<!doctype html>
    <input id="piano-gliss-mode" type="checkbox">
    <input id="piano-computer-keyboard" type="checkbox">
    <input id="text-control">
    <p id="piano-qwerty-help"></p>
    <select id="select-control"><option>Choice</option></select>
    <div id="piano-visual"></div>`);
  global.window = environment.window;
  global.document = environment.window.document;

  dom = {
    pianoVisual: document.getElementById("piano-visual"),
    pianoGlissToggle: document.getElementById("piano-gliss-mode"),
    pianoComputerKeyboardToggle: document.getElementById("piano-computer-keyboard"),
    pianoIndicatorRadios: [],
    __pianoGlissMode: false,
    __pianoComputerKeyboardEnabled: false,
  };
  buildPianoVisual(dom, { compact: false });
  onPianoKeyDown = vi.fn();
  onPianoKeyUp = vi.fn();
  disposeEvents = wirePianoInteractions(dom, { onPianoKeyDown, onPianoKeyUp });
});

afterEach(() => {
  disposeEvents?.();
  environment?.window.close();
  delete global.window;
  delete global.document;
});

describe("Live Piano input", () => {
  it("uses one roving tab stop with chromatic arrow navigation and Enter/Space activation", () => {
    const middleC = dom.pianoVisual.querySelector('[data-note="C4"]');
    expect([...dom.pianoVisual.querySelectorAll('[tabindex="0"]')]).toEqual([middleC]);

    middleC.focus();
    middleC.dispatchEvent(keyboardEvent("keydown", "ArrowRight"));
    const cSharp = dom.pianoVisual.querySelector('[data-note="C#4"]');
    expect(document.activeElement).toBe(cSharp);
    expect(cSharp.tabIndex).toBe(0);
    expect(middleC.tabIndex).toBe(-1);

    cSharp.dispatchEvent(keyboardEvent("keydown", " "));
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C#4", "screenKey");
    cSharp.dispatchEvent(keyboardEvent("keyup", " "));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C#4", "screenKey");

    cSharp.dispatchEvent(keyboardEvent("keydown", "Home"));
    expect(document.activeElement.dataset.note).toBe("C2");
    document.activeElement.dispatchEvent(keyboardEvent("keydown", "End"));
    expect(document.activeElement.dataset.note).toBe("E6");
  });

  it("keeps QWERTY opt-in and pauses shortcuts while a form control has focus", () => {
    expect(QWERTY_PIANO_NOTES.a).toBe("C4");
    window.dispatchEvent(keyboardEvent("keydown", "a"));
    expect(onPianoKeyDown).not.toHaveBeenCalled();

    dom.pianoComputerKeyboardToggle.checked = true;
    dom.pianoComputerKeyboardToggle.dispatchEvent(new window.Event("change", { bubbles: true }));
    window.dispatchEvent(keyboardEvent("keydown", "a"));
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C4", "computerKeyboard");
    window.dispatchEvent(keyboardEvent("keyup", "a"));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C4", "computerKeyboard");

    const callsBeforeTyping = onPianoKeyDown.mock.calls.length;
    const textControl = document.getElementById("text-control");
    textControl.focus();
    textControl.dispatchEvent(keyboardEvent("keydown", "s"));
    expect(onPianoKeyDown).toHaveBeenCalledTimes(callsBeforeTyping);

    document.body.focus();
    window.dispatchEvent(keyboardEvent("keydown", "d"));
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("E4", "computerKeyboard");
    dom.pianoComputerKeyboardToggle.checked = false;
    dom.pianoComputerKeyboardToggle.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("E4", "computerKeyboard");
  });

  it("shifts the computer-key octave with Z and X, releasing held keys first", () => {
    dom.pianoComputerKeyboardToggle.checked = true;
    dom.pianoComputerKeyboardToggle.dispatchEvent(new window.Event("change", { bubbles: true }));
    const help = document.getElementById("piano-qwerty-help");

    expect(help.textContent).toContain("C4–C5");
    window.dispatchEvent(keyboardEvent("keydown", "a"));
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C4", "computerKeyboard");

    window.dispatchEvent(keyboardEvent("keydown", "x"));
    // The held C4 is released before the octave moves, so it cannot stick.
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C4", "computerKeyboard");
    expect(help.textContent).toContain("C5–C6");

    window.dispatchEvent(keyboardEvent("keydown", "a"));
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C5", "computerKeyboard");
    window.dispatchEvent(keyboardEvent("keyup", "a"));

    for (let i = 0; i < 6; i += 1) window.dispatchEvent(keyboardEvent("keydown", "z"));
    window.dispatchEvent(keyboardEvent("keydown", "k"));
    // Clamped two octaves below the default: k is C5 by default, so C3.
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C3", "computerKeyboard");
  });

  it("allows default touch gestures but captures pointers in explicit gliss mode", () => {
    const middleC = dom.pianoVisual.querySelector('[data-note="C4"]');
    const defaultPointer = pointerEvent("pointerdown");
    middleC.dispatchEvent(defaultPointer);
    expect(defaultPointer.defaultPrevented).toBe(false);
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C4", "pointer");
    middleC.dispatchEvent(pointerEvent("pointercancel"));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C4", "pointer");

    dom.pianoGlissToggle.checked = true;
    dom.pianoGlissToggle.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(dom.pianoVisual.classList.contains("gliss-mode")).toBe(true);

    const glissPointer = pointerEvent("pointerdown", { pointerId: 2 });
    middleC.dispatchEvent(glissPointer);
    expect(glissPointer.defaultPrevented).toBe(true);
  });

  it("removes every listener and releases held notes when disposed", () => {
    dom.pianoComputerKeyboardToggle.checked = true;
    dom.pianoComputerKeyboardToggle.dispatchEvent(new window.Event("change", { bubbles: true }));
    window.dispatchEvent(keyboardEvent("keydown", "a"));
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C4", "computerKeyboard");

    onPianoKeyDown.mockClear();
    onPianoKeyUp.mockClear();
    disposeEvents();
    expect(onPianoKeyUp).toHaveBeenCalledOnce();
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C4", "computerKeyboard");

    window.dispatchEvent(keyboardEvent("keydown", "s"));
    dom.pianoVisual
      .querySelector('[data-note="C4"]')
      .dispatchEvent(pointerEvent("pointerdown", { pointerId: 7 }));
    expect(onPianoKeyDown).not.toHaveBeenCalled();
  });
});
