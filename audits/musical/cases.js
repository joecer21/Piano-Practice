import {
  DEFAULT_ASSIGNMENT_INPUTS,
  normalizeAssignmentInputs,
  rerollAssignmentInputs,
} from "../../domain/assignment.js";
import { PRESET_CONFIGS } from "../../presets.js";
import {
  LEFT_HAND_PATTERN_METADATA,
  MOTIF_STYLES,
  SCALE_PATTERNS,
  getProgressionPreset,
} from "../../theory.js";

const input = (overrides) =>
  normalizeAssignmentInputs({
    ...DEFAULT_ASSIGNMENT_INPUTS,
    presetId: null,
    customProgressionRoman: [],
    ...overrides,
  });

const presetInput = (preset) =>
  input({
    key: preset.key,
    mode: preset.mode,
    progressionPresetId: preset.progressionPresetId,
    styleId: preset.styleId,
    length: preset.length,
    lhId: preset.lhId,
    motifId: preset.motifId,
    presetId: preset.id,
    seed: `audit:preset:${preset.id}`,
  });

const label = (catalog, id) => catalog[id]?.label ?? id;

function presetCase(preset) {
  const progression = getProgressionPreset(preset.progressionPresetId)?.label ?? preset.progressionPresetId;
  const motif = label(MOTIF_STYLES, preset.motifId);
  const leftHand = label(LEFT_HAND_PATTERN_METADATA, preset.lhId);
  return {
    id: `preset:${preset.id}`,
    title: preset.name,
    categories: ["curated-preset", `collection:${preset.mode}`, `style:${preset.styleId}`],
    tempoBpm: 90,
    inputs: presetInput(preset),
    rationale: `Every shipped preset is a release promise. This case freezes ${progression}, ${leftHand}, and ${motif} together.`,
    listenFor: [
      `Does the ${motif} melody agree with each chord in ${progression}?`,
      `Does ${leftHand} remain comfortable and distinct from the right hand?`,
      `Does the result read clearly as ${preset.styleId}, without mechanical or distracting repetition?`,
    ],
  };
}

const focusedCases = [
  {
    id: "semantics:parent-degree-minor-pentatonic",
    title: "Parent degrees with a passing 2 in A minor pentatonic",
    categories: ["parent-degree", "borrowed-note", "passing-tone", "collection:pentatonicMinor"],
    tempoBpm: 84,
    inputs: input({
      key: "A",
      mode: "pentatonicMinor",
      progressionPresetId: "modal-vamp",
      styleId: "modal",
      length: 8,
      lhId: "pedal",
      motifId: "step-arch",
      seed: "audit:parent-degree-minor-pentatonic",
    }),
    rationale:
      "A parent-degree motif keeps 2 as B between A and C. It is outside the pentatonic collection but inside natural minor.",
    listenFor: [
      "Does B behave as a brief passing tone rather than a new tonal center?",
      "Does the melodic arch still land clearly on A over the modal harmony?",
    ],
  },
  {
    id: "semantics:scale-step-minor-pentatonic",
    title: "Scale-step run through A minor pentatonic",
    categories: ["scale-step", "collection:pentatonicMinor"],
    tempoBpm: 76,
    inputs: input({
      key: "A",
      mode: "pentatonicMinor",
      progressionPresetId: "modal-vamp",
      styleId: "modal",
      length: 8,
      lhId: "pedal",
      motifId: "scalar-run-8ths",
      seed: "audit:scale-step-minor-pentatonic",
    }),
    rationale: "A genuine scale run counts collection steps, so it must omit natural minor's 2 and ♭6.",
    listenFor: [
      "Does the run sound unmistakably pentatonic rather than like a natural-minor scale?",
      "Is the register comfortable when the run crosses its octave boundary?",
    ],
  },
  {
    id: "collection:major-pentatonic-exemplar",
    title: "Major pentatonic characteristic 6",
    categories: ["collection-exemplar", "collection:pentatonicMajor"],
    tempoBpm: 96,
    inputs: input({
      key: "C",
      mode: "pentatonicMajor",
      progressionPresetId: "pent-bootcamp",
      styleId: "pop",
      length: 4,
      lhId: "block",
      motifId: "funk-sync-6",
      seed: "audit:major-pentatonic-exemplar",
    }),
    rationale:
      "The collection exemplar replaces funk-sync's accented 7 with the characteristic major-pentatonic 6.",
    listenFor: [
      "Does the accented 6 sound idiomatic against the progression?",
      "Does the syncopation retain a recognizable funk character?",
    ],
  },
  {
    id: "collection:major-blues-exemplar",
    title: "Major blues curl from ♭3 to 3",
    categories: ["collection-exemplar", "chromatic-color", "collection:majorBlues"],
    tempoBpm: 92,
    inputs: input({
      key: "C",
      mode: "majorBlues",
      progressionPresetId: "blues-12",
      styleId: "jazz",
      length: 12,
      lhId: "root-5th-oct",
      motifId: "blues-riff-major",
      seed: "audit:major-blues-exemplar",
    }),
    rationale:
      "The major-blues exemplar makes its identity audible by curling from ♭3 into the chord's major 3.",
    listenFor: [
      "Does ♭3 resolve convincingly into 3 rather than sounding like a wrong chord tone?",
      "Does the line remain convincing across I, IV and V harmony?",
    ],
  },
  {
    id: "semantics:major-blues-major-third",
    title: "1–3–5–1 outlines the major tonic in major blues",
    categories: ["parent-degree", "collection:majorBlues", "historical-regression"],
    tempoBpm: 88,
    inputs: input({
      key: "C",
      mode: "majorBlues",
      progressionPresetId: "blues-12",
      styleId: "pop",
      length: 12,
      lhId: "block",
      motifId: "pop-hook-1351",
      seed: "audit:major-blues-major-third",
    }),
    rationale:
      "The written 3 is E, not the collection's earlier ♭3; the hook should outline the major tonic chord.",
    listenFor: [
      "Does the major third agree with the tonic harmony throughout the blues form?",
      "Does omitting ♭3 from this particular hook still leave a coherent assignment?",
    ],
  },
  {
    id: "color:major-pentatonic-modal-fourth",
    title: "Named 4 color over C major pentatonic",
    categories: ["borrowed-note", "accented-outside-note", "collection:pentatonicMajor"],
    tempoBpm: 72,
    inputs: input({
      key: "C",
      mode: "pentatonicMajor",
      progressionPresetId: "modal-vamp",
      styleId: "modal",
      length: 8,
      lhId: "pedal",
      motifId: "modal-pedal",
      seed: "audit:major-pentatonic-modal-fourth",
    }),
    rationale:
      "The held 4 is deliberately named color outside major pentatonic, not an accidental passing tone.",
    listenFor: [
      "Does the sustained F create useful modal tension rather than fight the tonic's E?",
      "Is the tension appropriately obvious for an easy-level motif?",
    ],
  },
  {
    id: "harmony:custom-borrowed-cadence",
    title: "Custom I–V/vi–vi–iv cadence in C",
    categories: ["custom-progression", "secondary-dominant", "borrowed-chord"],
    tempoBpm: 82,
    inputs: input({
      key: "C",
      mode: "major",
      progressionPresetId: "custom",
      customProgressionRoman: ["I", "V/vi", "vi", "iv"],
      styleId: "pop",
      length: 4,
      lhId: "broken",
      motifId: "ballad-long",
      seed: "audit:custom-borrowed-cadence",
    }),
    rationale: "A user-authored progression combines a secondary dominant with borrowed minor iv.",
    listenFor: [
      "Does V/vi point clearly to vi?",
      "Does the motif tolerate the chromatic harmony without accidental clashes?",
      "Does minor iv provide a convincing return gesture?",
    ],
  },
  {
    id: "boundary:narrow-hands-property-60",
    title: "Narrow safe hand spacing regression",
    categories: ["range-boundary", "hand-spacing", "historical-regression", "collection:minorBlues"],
    tempoBpm: 90,
    inputs: rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: "property-60" }),
    rationale: "A historically tight generated pairing exercises the lower safe separation between hands.",
    listenFor: [
      "Can both hands be played without collision or awkward crossing?",
      "Does the register remain clear when the pedal pattern and motif overlap in pitch area?",
    ],
  },
  {
    id: "boundary:wide-hands-property-22",
    title: "Wide safe hand spacing regression",
    categories: ["range-boundary", "hand-spacing", "historical-regression"],
    tempoBpm: 90,
    inputs: rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: "property-22" }),
    rationale:
      "A generated pairing near the upper allowed hand gap guards against an impractical split register.",
    listenFor: [
      "Is the hand separation physically and musically coherent?",
      "Does the walking accompaniment still support rather than detach from the melody?",
    ],
  },
  {
    id: "historical:three-beat-duration-property-4",
    title: "Three-beat motif duration regression",
    categories: ["duration-boundary", "historical-regression"],
    tempoBpm: 90,
    inputs: rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: "property-4" }),
    rationale:
      "This fingerprint case contains the three-beat funk-sync note that was once truncated to one beat.",
    listenFor: [
      "Does the long note sustain for three beats?",
      "Does its release preserve the intended groove?",
    ],
  },
  {
    id: "historical:four-beat-duration-property-24",
    title: "Four-beat motif duration regression",
    categories: ["duration-boundary", "historical-regression"],
    tempoBpm: 90,
    inputs: rerollAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS, { seed: "property-24" }),
    rationale:
      "This fingerprint case contains the four-beat modal-pedal note that was once truncated to one beat.",
    listenFor: [
      "Does the tonic sustain for the complete four-beat bar?",
      "Does the following color gesture enter cleanly after the held note?",
    ],
  },
];

/** Stable, intentional inputs for human musical review. */
export function musicalAuditCaseDefinitions() {
  return [...PRESET_CONFIGS.map(presetCase), ...focusedCases].map((entry) => ({
    ...entry,
    inputs: { ...entry.inputs, customProgressionRoman: [...entry.inputs.customProgressionRoman] },
    categories: [...entry.categories],
    listenFor: [...entry.listenFor],
  }));
}

/** Labels used by reports without asking UI code to understand the theory catalogs. */
export function musicalAuditInputSummary(inputs) {
  return {
    keyAndCollection: `${inputs.key} ${label(SCALE_PATTERNS, inputs.mode)}`,
    progression: getProgressionPreset(inputs.progressionPresetId)?.label ?? "Custom progression",
    leftHand: label(LEFT_HAND_PATTERN_METADATA, inputs.lhId),
    motif: inputs.motifId === "none" ? "No motif" : label(MOTIF_STYLES, inputs.motifId),
  };
}
