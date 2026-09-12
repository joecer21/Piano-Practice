import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { buildPianoVisual } from "../components/piano.js";
import { QWERTY_PIANO_NOTES, wireEvents } from "../ui.js";

let environment;
let dom;
let onPianoKeyDown;
let onPianoKeyUp;

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
    <select id="select-control"><option>Choice</option></select>
    <div id="piano-visual"></div>`);
  global.window = environment.window;
  global.document = environment.window.document;

  dom = {
    pianoVisual: document.getElementById("piano-visual"),
    pianoGlissToggle: document.getElementById("piano-gliss-mode"),
    pianoComputerKeyboardToggle: document.getElementById("piano-computer-keyboard"),
    pianoIndicatorRadios: [],
    playButtons: [],
    __pianoGlissMode: false,
    __pianoComputerKeyboardEnabled: false,
  };
  buildPianoVisual(dom, { compact: false });
  onPianoKeyDown = vi.fn();
  onPianoKeyUp = vi.fn();
  wireEvents(dom, { onPianoKeyDown, onPianoKeyUp });
});

afterEach(() => {
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
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C#4");
    cSharp.dispatchEvent(keyboardEvent("keyup", " "));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C#4");

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
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C4");
    window.dispatchEvent(keyboardEvent("keyup", "a"));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C4");

    const callsBeforeTyping = onPianoKeyDown.mock.calls.length;
    const textControl = document.getElementById("text-control");
    textControl.focus();
    textControl.dispatchEvent(keyboardEvent("keydown", "s"));
    expect(onPianoKeyDown).toHaveBeenCalledTimes(callsBeforeTyping);

    document.body.focus();
    window.dispatchEvent(keyboardEvent("keydown", "d"));
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("E4");
    dom.pianoComputerKeyboardToggle.checked = false;
    dom.pianoComputerKeyboardToggle.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("E4");
  });

  it("allows default touch gestures but captures pointers in explicit gliss mode", () => {
    const middleC = dom.pianoVisual.querySelector('[data-note="C4"]');
    const defaultPointer = pointerEvent("pointerdown");
    middleC.dispatchEvent(defaultPointer);
    expect(defaultPointer.defaultPrevented).toBe(false);
    expect(onPianoKeyDown).toHaveBeenLastCalledWith("C4");
    middleC.dispatchEvent(pointerEvent("pointercancel"));
    expect(onPianoKeyUp).toHaveBeenLastCalledWith("C4");

    dom.pianoGlissToggle.checked = true;
    dom.pianoGlissToggle.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(dom.pianoVisual.classList.contains("gliss-mode")).toBe(true);

    const glissPointer = pointerEvent("pointerdown", { pointerId: 2 });
    middleC.dispatchEvent(glissPointer);
    expect(glissPointer.defaultPrevented).toBe(true);
  });
});
