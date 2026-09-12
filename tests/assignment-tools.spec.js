import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { renderAssignmentTools, wireEvents } from "../ui.js";

function createDom() {
  const env = new JSDOM(`<!doctype html><body>
    <button id="reroll">Reroll unlocked</button>
    <button id="undo">Undo</button>
    <button id="redo">Redo</button>
    <button data-assignment-lock="key">Lock key</button>
    <button data-assignment-lock="motif">Lock motif</button>
    <code id="seed"></code>
    <span id="id"></span>
  </body>`);
  const document = env.window.document;
  return {
    env,
    dom: {
      assignmentReroll: document.getElementById("reroll"),
      assignmentUndo: document.getElementById("undo"),
      assignmentRedo: document.getElementById("redo"),
      assignmentSeed: document.getElementById("seed"),
      assignmentId: document.getElementById("id"),
      assignmentLockButtons: document.querySelectorAll("[data-assignment-lock]"),
      playButtons: [],
    },
  };
}

describe("Assignment workbench", () => {
  it("renders lock, history, identity, and all-locked states", () => {
    const { env, dom } = createDom();
    const state = {
      locks: { key: true, harmony: true, groove: true, motif: true },
      assignment: { id: "assignment-00abc123", seed: "variation-7" },
    };

    renderAssignmentTools(dom, state, { canUndo: true, canRedo: false });

    expect(dom.assignmentLockButtons[0].getAttribute("aria-pressed")).toBe("true");
    expect(dom.assignmentLockButtons[0].textContent).toBe("Unlock key");
    expect(dom.assignmentReroll.disabled).toBe(true);
    expect(dom.assignmentUndo.disabled).toBe(false);
    expect(dom.assignmentRedo.disabled).toBe(true);
    expect(dom.assignmentSeed.textContent).toBe("variation-7");
    expect(dom.assignmentId.textContent).toBe("ID 00abc123");
    env.window.close();
  });

  it("wires reroll, history, and lock actions", () => {
    const { env, dom } = createDom();
    const handlers = {
      onAssignmentReroll: vi.fn(),
      onAssignmentUndo: vi.fn(),
      onAssignmentRedo: vi.fn(),
      onAssignmentLockToggle: vi.fn(),
    };
    wireEvents(dom, handlers);

    dom.assignmentReroll.click();
    dom.assignmentUndo.click();
    dom.assignmentRedo.click();
    dom.assignmentLockButtons[1].click();

    expect(handlers.onAssignmentReroll).toHaveBeenCalledOnce();
    expect(handlers.onAssignmentUndo).toHaveBeenCalledOnce();
    expect(handlers.onAssignmentRedo).toHaveBeenCalledOnce();
    expect(handlers.onAssignmentLockToggle).toHaveBeenCalledWith("motif");
    env.window.close();
  });
});
