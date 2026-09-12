import { generateScale, generateProgression, createPhrasePlan, generateLeftHandPattern } from "../engine.js";
import {
  getProgressionPreset,
  HAND_RANGE_SPECS,
  parseRomanSymbol,
  noteStringToMidi,
  midiToNote,
  getStyleProfile,
} from "../theory.js";
import { PRESET_CONFIGS } from "../presets.js";

const presets = PRESET_CONFIGS;

const LH_RANGE = buildRangeSet(HAND_RANGE_SPECS.lh);

function buildProgression({ key, mode, progressionPresetId, styleId }) {
  const preset = getProgressionPreset(progressionPresetId);
  const length = preset?.roman?.length || 4;
  const scale = generateScale({ key, mode });
  const styleProfile = getStyleProfile(styleId || "classical");
  const progression = generateProgression({ key, mode, length, progressionPresetId }, scale, styleProfile);
  return { progression, scale };
}

function buildRangeSet(spec = {}) {
  const comfortLow = spec.comfort?.low || "C2";
  const comfortHigh = spec.comfort?.high || "C4";
  const softLow = spec.soft?.low || "A1";
  const softHigh = spec.soft?.high || "F4";
  return {
    comfort: {
      min: noteStringToMidi(comfortLow),
      max: noteStringToMidi(comfortHigh),
    },
    soft: {
      min: noteStringToMidi(softLow),
      max: noteStringToMidi(softHigh),
    },
  };
}

function flattenBarNotes(bar) {
  const events = [];
  bar.steps.forEach((step) => {
    if (!step) return;
    if (step.notes && step.notes.length) {
      step.notes.forEach((note) => {
        events.push({ time: step.time, note, midi: noteStringToMidi(note) });
      });
    } else if (step.note) {
      events.push({ time: step.time, note: step.note, midi: noteStringToMidi(step.note) });
    }
  });
  return events.sort((a, b) => a.time - b.time || a.midi - b.midi);
}

function classifyRange(midi) {
  if (midi < LH_RANGE.soft.min) return "below-soft";
  if (midi > LH_RANGE.soft.max) return "above-soft";
  if (midi < LH_RANGE.comfort.min) return "below-comfort";
  if (midi > LH_RANGE.comfort.max) return "above-comfort";
  return "ok";
}

function matchChordAnchor(anchors = {}, symbol) {
  if (!symbol) return null;
  const parsed = parseRomanSymbol(symbol);
  const variants = [];
  if (parsed) {
    const accidental = parsed.accStr || "";
    const numeral = parsed.numeral || symbol;
    const extension = parsed.extension || "";
    const base = `${accidental}${numeral}`;
    variants.push(base, base.toUpperCase(), base.toLowerCase());
    if (extension) {
      const extended = `${base}${extension}`;
      variants.push(extended, extended.toUpperCase(), extended.toLowerCase());
    }
    variants.push(numeral, numeral.toUpperCase(), numeral.toLowerCase());
  }
  variants.push(symbol, symbol.toUpperCase(), symbol.toLowerCase());
  for (const key of variants) {
    if (key && anchors[key]) return anchors[key];
  }
  return null;
}

function resolveExpectedRoot(preset, symbol) {
  if (!preset) return { note: null, strict: false };
  const chordMatch = matchChordAnchor(preset.anchors?.chords || {}, symbol);
  if (chordMatch) {
    return { note: chordMatch, strict: true };
  }
  return { note: preset.anchors?.lh || null, strict: false };
}

function describeBar(bar, romanSymbol, preset) {
  const notes = flattenBarNotes(bar);
  const expectedRoot = resolveExpectedRoot(preset, romanSymbol);
  const noteList = notes.map((n) => `${n.time}:${n.note}`).join(", ");
  const summaryCore = noteList || "(rests)";
  const warnings = [];
  const firstNote = notes[0];
  if (expectedRoot.note && firstNote && expectedRoot.strict) {
    const expectedMidi = noteStringToMidi(expectedRoot.note);
    const delta = firstNote.midi - expectedMidi;
    const matches = delta === 0;
    const intervalLabel = delta === 0 ? "in tune" : `${delta > 0 ? "+" : ""}${delta}`;
    if (!matches) {
      const reason = Math.abs(delta) === 12 ? "range-guard shift" : "anchor drift";
      warnings.push(
        `root mismatch: expected ${expectedRoot.note}, got ${firstNote.note} (${intervalLabel}, ${reason})`,
      );
    }
  } else if (expectedRoot.note && !firstNote && expectedRoot.strict) {
    warnings.push(`missing LH output (expected root ${expectedRoot.note})`);
  }

  const statusCounts = { above: 0, below: 0 };
  let minMidi = null;
  let maxMidi = null;
  notes.forEach((n) => {
    minMidi = minMidi == null ? n.midi : Math.min(minMidi, n.midi);
    maxMidi = maxMidi == null ? n.midi : Math.max(maxMidi, n.midi);
    const rangeStatus = classifyRange(n.midi);
    if (rangeStatus === "above-comfort" || rangeStatus === "above-soft") {
      statusCounts.above += 1;
    } else if (rangeStatus === "below-comfort" || rangeStatus === "below-soft") {
      statusCounts.below += 1;
    }
  });

  if (statusCounts.above) {
    warnings.push(
      `${statusCounts.above} notes above LH comfort (${midiToNote(LH_RANGE.comfort.max)} max comfort)`,
    );
  }
  if (statusCounts.below) {
    warnings.push(
      `${statusCounts.below} notes below LH comfort (${midiToNote(LH_RANGE.comfort.min)} min comfort)`,
    );
  }

  const rangeSummary = minMidi != null ? ` | range ${midiToNote(minMidi)}–${midiToNote(maxMidi)}` : "";
  return {
    summary: `${summaryCore}${rangeSummary}`,
    warnings,
  };
}

for (const preset of presets) {
  const { progression } = buildProgression(preset);
  const phrasePlan = createPhrasePlan({
    key: preset.key,
    mode: preset.mode,
    styleId: preset.styleId,
    motifPatternId: preset.motifId,
    leftHandPatternId: preset.lhId,
    anchors: preset.anchors,
  });
  const lh = generateLeftHandPattern(
    { leftHand: preset.lhId, difficulty: "intermediate", styleId: preset.styleId, phrasePlan },
    progression,
    preset.mode,
  );
  console.log("Preset", preset.id);
  lh.bars.forEach((bar, idx) => {
    const analysis = describeBar(bar, progression.roman[idx], preset);
    console.log(` Bar ${idx + 1}: ${bar.title} -> ${analysis.summary}`);
    analysis.warnings.forEach((warning) => console.log(`   ! ${warning}`));
  });
}
