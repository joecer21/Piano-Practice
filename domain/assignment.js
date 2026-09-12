// @ts-check

import {
  HAND_RANGE_SPECS,
  LEFT_HAND_PATTERN_METADATA,
  MOTIF_STYLES,
  NOTE_NAMES,
  NOTE_TO_INDEX,
  PROGRESSION_PRESETS,
  SCALE_PATTERNS,
  STYLE_PROFILES,
  getProgressionPreset,
  getStyleProfile,
  noteStringToMidi,
} from "../theory.js";
import {
  createPhrasePlan,
  generateCustomProgression,
  generateLeftHandPattern,
  generateMotif,
  generateProgression,
  generateScale,
} from "../engine.js";
import { DEFAULT_PRESET_ID, getPresetConfig } from "../presets.js";
import { createSeededRandom, deriveSeed, hashString, normalizeSeed, pickSeeded } from "./random.js";

export const ASSIGNMENT_SCHEMA_VERSION = 1;
export const ASSIGNMENT_LOCKS = Object.freeze(["key", "harmony", "groove", "motif"]);

/**
 * @typedef {object} AssignmentInputs
 * @property {string} key
 * @property {string} mode
 * @property {string} progressionPresetId
 * @property {string} styleId
 * @property {number} length
 * @property {string} lhId
 * @property {string} motifId
 * @property {string[]} customProgressionRoman
 * @property {string | null} presetId
 * @property {string} seed
 */

/**
 * @typedef {object} AssignmentLocks
 * @property {boolean} key
 * @property {boolean} harmony
 * @property {boolean} groove
 * @property {boolean} motif
 */

/**
 * @typedef {object} PracticeAssignment
 * @property {1} schemaVersion
 * @property {string} id
 * @property {string} seed
 * @property {AssignmentInputs} inputs
 * @property {ReturnType<typeof generateScale>} scale
 * @property {ReturnType<typeof generateProgression>} progression
 * @property {ReturnType<typeof generateLeftHandPattern>} leftHand
 * @property {ReturnType<typeof generateMotif>} motif
 * @property {{ id: string, label: string, description: string, humanize: object }} style
 * @property {ReturnType<typeof createPhrasePlan>} phrasePlan
 */

export const DEFAULT_ASSIGNMENT_INPUTS = Object.freeze({
  key: "C",
  mode: "major",
  progressionPresetId: "pop-4",
  styleId: "pop",
  length: 8,
  lhId: "pop-8ths",
  motifId: "pop-hook-1351",
  customProgressionRoman: Object.freeze([]),
  presetId: DEFAULT_PRESET_ID,
  seed: "piano-practice",
});

const DEFAULT_REROLL_CATALOG = Object.freeze({
  keys: Object.freeze([...NOTE_NAMES]),
  modes: Object.freeze(Object.keys(SCALE_PATTERNS)),
  progressions: Object.freeze(PROGRESSION_PRESETS.map((preset) => preset.id)),
  styles: Object.freeze(Object.keys(STYLE_PROFILES)),
  leftHands: Object.freeze(Object.keys(LEFT_HAND_PATTERN_METADATA)),
  motifs: Object.freeze([...Object.keys(MOTIF_STYLES), "none"]),
});

/**
 * Normalize external or UI-produced data into the canonical assignment input shape.
 * @param {Partial<AssignmentInputs>} [raw]
 * @returns {AssignmentInputs}
 */
export function normalizeAssignmentInputs(raw = {}) {
  const candidate = { ...DEFAULT_ASSIGNMENT_INPUTS, ...raw };
  const progressionPreset = getProgressionPreset(candidate.progressionPresetId);
  const fallbackLength = progressionPreset?.roman?.length || DEFAULT_ASSIGNMENT_INPUTS.length;
  const length = Number(candidate.length);
  const normalized = {
    key: String(candidate.key),
    mode: String(candidate.mode),
    progressionPresetId: String(candidate.progressionPresetId),
    styleId: String(candidate.styleId),
    length: Number.isInteger(length) && length > 0 ? length : fallbackLength,
    lhId: String(candidate.lhId),
    motifId: String(candidate.motifId),
    customProgressionRoman: Array.isArray(candidate.customProgressionRoman)
      ? candidate.customProgressionRoman.map(String)
      : [],
    presetId: candidate.presetId == null ? null : String(candidate.presetId),
    seed: normalizeSeed(candidate.seed),
  };
  assertValidAssignmentInputs(normalized);
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAssignmentInputs(value) {
  const input = /** @type {Partial<AssignmentInputs>} */ (value || {});
  const errors = [];
  if (!input || typeof input !== "object") return { valid: false, errors: ["inputs must be an object"] };
  if (!(String(input.key) in NOTE_TO_INDEX)) errors.push(`unknown key: ${String(input.key)}`);
  if (!(String(input.mode) in SCALE_PATTERNS)) errors.push(`unknown mode: ${String(input.mode)}`);
  if (input.progressionPresetId !== "custom" && !getProgressionPreset(String(input.progressionPresetId))) {
    errors.push(`unknown progression: ${String(input.progressionPresetId)}`);
  }
  if (!(String(input.styleId) in STYLE_PROFILES)) errors.push(`unknown style: ${String(input.styleId)}`);
  if (!(String(input.lhId) in LEFT_HAND_PATTERN_METADATA)) errors.push(`unknown left-hand pattern: ${String(input.lhId)}`);
  if (input.motifId !== "none" && !(String(input.motifId) in MOTIF_STYLES)) {
    errors.push(`unknown motif: ${String(input.motifId)}`);
  }
  if (!Number.isInteger(input.length) || Number(input.length) < 1 || Number(input.length) > 32) {
    errors.push("length must be an integer from 1 to 32");
  }
  if (!Array.isArray(input.customProgressionRoman) || input.customProgressionRoman.some((symbol) => typeof symbol !== "string" || !symbol.trim())) {
    errors.push("customProgressionRoman must contain non-empty strings");
  }
  if (input.progressionPresetId === "custom" && !input.customProgressionRoman?.length) {
    errors.push("custom progressions require at least one chord");
  }
  if (typeof input.seed !== "string" || !input.seed.trim()) errors.push("seed must be a non-empty string");
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} value */
export function assertValidAssignmentInputs(value) {
  const result = validateAssignmentInputs(value);
  if (!result.valid) throw new TypeError(`Invalid assignment inputs: ${result.errors.join("; ")}`);
}

/**
 * Generate a complete assignment through the deterministic musical engine.
 * @param {Partial<AssignmentInputs>} rawInputs
 * @returns {PracticeAssignment}
 */
export function generateAssignment(rawInputs) {
  const inputs = normalizeAssignmentInputs(rawInputs);
  const styleProfile = getStyleProfile(inputs.styleId);
  const scale = generateScale({ key: inputs.key, mode: inputs.mode });
  const progression = inputs.progressionPresetId === "custom"
    ? generateCustomProgression(inputs.key, inputs.customProgressionRoman, scale, inputs.mode, styleProfile)
    : generateProgression({
        key: inputs.key,
        mode: inputs.mode,
        length: inputs.length,
        progressionPresetId: inputs.progressionPresetId,
      }, scale, styleProfile);
  const preset = getPresetConfig(inputs.presetId);
  const phrasePlan = createPhrasePlan({
    key: inputs.key,
    mode: inputs.mode,
    styleId: inputs.styleId,
    motifPatternId: inputs.motifId,
    leftHandPatternId: inputs.lhId,
    anchors: preset?.anchors,
  });
  const leftHand = generateLeftHandPattern({
    leftHand: inputs.lhId,
    difficulty: "intermediate",
    styleId: inputs.styleId,
    phrasePlan,
  }, progression, inputs.mode);
  const motif = inputs.motifId === "none"
    ? null
    : generateMotif({ motifPatternId: inputs.motifId, styleId: inputs.styleId, phrasePlan }, scale);
  const idPayload = stableStringify(inputs);
  const assignment = {
    schemaVersion: /** @type {1} */ (ASSIGNMENT_SCHEMA_VERSION),
    id: `assignment-${hashString(idPayload).toString(16).padStart(8, "0")}`,
    seed: inputs.seed,
    inputs,
    scale,
    progression,
    leftHand,
    motif,
    style: {
      id: styleProfile.id,
      label: styleProfile.label,
      description: styleProfile.description,
      humanize: { ...styleProfile.humanize },
    },
    phrasePlan,
  };
  assertValidAssignment(assignment);
  return assignment;
}

/**
 * Produce reproducible input variations while respecting component locks.
 * @param {Partial<AssignmentInputs>} rawInputs
 * @param {{ seed?: string | number | bigint, locks?: Partial<AssignmentLocks>, catalog?: Partial<typeof DEFAULT_REROLL_CATALOG> }} [options]
 * @returns {AssignmentInputs}
 */
export function rerollAssignmentInputs(rawInputs, options = {}) {
  const inputs = normalizeAssignmentInputs(rawInputs);
  const locks = { key: false, harmony: false, groove: false, motif: false, ...(options.locks || {}) };
  const catalog = { ...DEFAULT_REROLL_CATALOG, ...(options.catalog || {}) };
  const seed = normalizeSeed(options.seed ?? deriveSeed(inputs.seed, "reroll"));
  const rng = createSeededRandom(seed);
  const preservePresetAnchors = locks.key && locks.harmony && locks.groove;
  const next = { ...inputs, seed, presetId: preservePresetAnchors ? inputs.presetId : null };

  if (!locks.key) {
    next.key = pickDifferent(catalog.keys, inputs.key, rng);
    next.mode = pickDifferent(catalog.modes, inputs.mode, rng);
  }
  if (!locks.harmony) {
    next.progressionPresetId = pickDifferent(catalog.progressions, inputs.progressionPresetId, rng);
    next.customProgressionRoman = [];
  }
  if (!locks.groove) {
    next.styleId = pickDifferent(catalog.styles, inputs.styleId, rng);
    next.lhId = pickDifferent(catalog.leftHands, inputs.lhId, rng);
  }
  if (!locks.motif) {
    next.motifId = pickDifferent(catalog.motifs, inputs.motifId, rng);
  }

  return normalizeAssignmentInputs(next);
}

/**
 * @param {unknown} value
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAssignment(value) {
  const assignment = /** @type {Partial<PracticeAssignment>} */ (value || {});
  const errors = [];
  if (!assignment || typeof assignment !== "object") return { valid: false, errors: ["assignment must be an object"] };
  if (assignment.schemaVersion !== ASSIGNMENT_SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  const inputResult = validateAssignmentInputs(assignment.inputs);
  errors.push(...inputResult.errors);
  if (!assignment.id || typeof assignment.id !== "string") errors.push("assignment id is required");
  if (!assignment.scale?.notes?.length) errors.push("scale must contain notes");
  if (!assignment.style?.id || assignment.style.id !== assignment.inputs?.styleId) {
    errors.push("style metadata must match inputs.styleId");
  }
  if (!assignment.progression?.bars?.length) errors.push("progression must contain bars");
  if (assignment.progression?.roman?.length !== assignment.progression?.bars?.length) {
    errors.push("progression roman and bar counts must match");
  }
  if (assignment.leftHand?.bars?.length !== assignment.progression?.bars?.length) {
    errors.push("left-hand and progression bar counts must match");
  }
  if (assignment.leftHand?.bars?.some((bar) => !Array.isArray(bar.steps))) {
    errors.push("every left-hand bar must contain steps");
  }
  if (assignment.motif && (!Array.isArray(assignment.motif.steps) || assignment.motif.totalBeats <= 0)) {
    errors.push("motif steps and duration must be valid");
  }
  if (assignment.phrasePlan?.lh?.anchorNote && assignment.phrasePlan?.rh?.anchorNote) {
    const gap = noteStringToMidi(assignment.phrasePlan.rh.anchorNote) - noteStringToMidi(assignment.phrasePlan.lh.anchorNote);
    if (gap < 4 || gap > 30) errors.push(`hand anchor gap ${gap} is outside 4–30 semitones`);
  }
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} value */
export function assertValidAssignment(value) {
  const result = validateAssignment(value);
  if (!result.valid) throw new TypeError(`Invalid assignment: ${result.errors.join("; ")}`);
}

export function getAssignmentRangeSpecs() {
  return HAND_RANGE_SPECS;
}

/** @template T @param {readonly T[]} values @param {T} current @param {() => number} rng @returns {T} */
function pickDifferent(values, current, rng) {
  const alternatives = values.filter((value) => value !== current);
  return /** @type {T} */ (pickSeeded(alternatives.length ? alternatives : values, rng) ?? current);
}

/** @param {unknown} value */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
