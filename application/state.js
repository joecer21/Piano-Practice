// @ts-check

import {
  ASSIGNMENT_LOCKS,
  DEFAULT_ASSIGNMENT_INPUTS,
  normalizeAssignmentInputs,
  rerollAssignmentInputs,
} from "../domain/assignment.js";
import { buildScore } from "../domain/score.ts";
import { getStyleProfile } from "../theory.js";

/** @typedef {import("../domain/assignment.js").AssignmentInputs} AssignmentInputs */
/** @typedef {import("../domain/assignment.js").AssignmentLocks} AssignmentLocks */
/** @typedef {import("../domain/assignment.js").PracticeAssignment} PracticeAssignment */

/**
 * @param {object} [overrides]
 */
export function createInitialAppState(overrides = {}) {
  const inputs = normalizeAssignmentInputs(overrides.inputs || DEFAULT_ASSIGNMENT_INPUTS);
  return {
    tempo: 90,
    derived: {
      scale: null,
      progression: null,
      leftHand: null,
      motif: null,
      styleProfile: null,
      phrasePlan: null,
      score: null,
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
      livePianoIndicatorMode: "both",
      livePianoGlissMode: false,
      livePianoComputerKeyboardEnabled: false,
      livePianoChordMode: "single",
    },
    locks: createAssignmentLocks(),
    assignment: null,
    history: { past: [], future: [] },
    ...overrides,
    // Re-applied after the spread so a raw overrides.inputs cannot bypass
    // normalizeAssignmentInputs.
    inputs,
  };
}

/**
 * Mutable compatibility store: existing DOM code can keep one state reference while
 * assignment commits, history, and locks move behind explicit operations.
 * @param {{ initialState?: ReturnType<typeof createInitialAppState>, historyLimit?: number }} [options]
 */
export function createAppStore(options = {}) {
  const state = options.initialState || createInitialAppState();
  const historyLimit = Math.max(1, options.historyLimit || 50);
  /** @type {Set<() => void>} */
  const listeners = new Set();
  // Notify after the committed assignment changes. The coach reads the store
  // through useSyncExternalStore, so this is its only change signal.
  const notify = () => listeners.forEach((listener) => listener());

  return {
    state,
    /** @param {() => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** @param {Partial<AssignmentInputs>} patch */
    updateInputs(patch) {
      state.inputs = normalizeAssignmentInputs({ ...state.inputs, ...patch });
      return state.inputs;
    },
    /** @param {PracticeAssignment} assignment @param {{ recordHistory?: boolean }} [commitOptions] */
    commitAssignment(assignment, commitOptions = {}) {
      if (
        state.assignment &&
        state.assignment.id !== assignment.id &&
        commitOptions.recordHistory !== false
      ) {
        state.history.past.push(state.assignment);
        if (state.history.past.length > historyLimit) state.history.past.shift();
      }
      state.history.future.length = 0;
      applyAssignment(state, assignment);
      notify();
      return assignment;
    },
    undo() {
      const previous = state.history.past.pop();
      if (!previous) return null;
      if (state.assignment) state.history.future.push(state.assignment);
      applyAssignment(state, previous);
      notify();
      return previous;
    },
    redo() {
      const next = state.history.future.pop();
      if (!next) return null;
      if (state.assignment) state.history.past.push(state.assignment);
      applyAssignment(state, next);
      notify();
      return next;
    },
    /** @param {Partial<AssignmentLocks>} patch */
    setLocks(patch) {
      state.locks = createAssignmentLocks({ ...state.locks, ...patch });
      return state.locks;
    },
    /** @param {(typeof ASSIGNMENT_LOCKS)[number]} component */
    toggleLock(component) {
      if (!ASSIGNMENT_LOCKS.includes(component)) throw new TypeError(`Unknown assignment lock: ${component}`);
      return this.setLocks({ [component]: !state.locks[component] });
    },
    /** @param {string | number | bigint | undefined} [seed] */
    reroll(seed) {
      state.inputs = rerollAssignmentInputs(state.inputs, { seed, locks: state.locks });
      return state.inputs;
    },
    canUndo() {
      return state.history.past.length > 0;
    },
    canRedo() {
      return state.history.future.length > 0;
    },
  };
}

/** @param {Partial<AssignmentLocks>} [overrides] @returns {AssignmentLocks} */
export function createAssignmentLocks(overrides = {}) {
  return {
    key: Boolean(overrides.key),
    harmony: Boolean(overrides.harmony),
    groove: Boolean(overrides.groove),
    motif: Boolean(overrides.motif),
  };
}

/** @param {ReturnType<typeof createInitialAppState>} state @param {PracticeAssignment} assignment */
function applyAssignment(state, assignment) {
  state.assignment = assignment;
  state.inputs = {
    ...assignment.inputs,
    customProgressionRoman: [...assignment.inputs.customProgressionRoman],
  };
  state.derived = {
    scale: assignment.scale,
    progression: assignment.progression,
    leftHand: assignment.leftHand,
    motif: assignment.motif,
    styleProfile: getStyleProfile(assignment.inputs.styleId),
    phrasePlan: assignment.phrasePlan,
    score: buildScore(assignment),
  };
}
