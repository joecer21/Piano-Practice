// engine.js
// Derivation layer: scales, progressions, LH patterns, motifs.

import {
  NOTE_NAMES,
  MODE_LABELS,
  SCALE_PATTERNS,
  NOTE_TO_INDEX,
  PROGRESSION_PRESETS,
  MOTIF_STYLES,
  LEFT_HAND_PATTERN_METADATA,
  HAND_RANGE_SPECS,
  getStyleAnchors,
  getProgressionPreset,
  getLeftHandStyleStrategy,
  noteToMidi,
  midiToNote,
  noteStringToMidi,
  findClosestOctave,
  beatsToTone,
  durationToNotation,
  buildChord,
  stripOctave,
  toneToBeatsFromDuration,
  degreeToNote,
  getStylePlaybackHints,
  analyzeRomanAgainstMode,
  parseRomanSymbol,
} from "./theory.js";

/**
 * Canonical pattern event schema (LH, motif, future parts):
 * type PatternStep = {
 *   time: number;        // start time in beats
 *   beats: number;       // duration in beats
 *   duration: string;    // Tone.js duration ("4n", "8n", etc.)
 *   note?: string;
 *   notes?: string[];
 *   rest?: boolean;
 * };
 */

const MAX_BAR_SHIFT_ATTEMPTS = 4;

const HAND_RANGE_MAP = buildHandRangeMap(HAND_RANGE_SPECS);
const PATTERN_OCTAVE_REQUIREMENTS = new Set(["root-5th-oct", "pop-8ths", "power-8ths"]);
const STYLE_LH_ANCHOR_GAPS = {
  classical: 13,
  pop: 14,
  jazz: 12,
  modal: 13,
  blues: 13,
  dramatic: 13,
  practice: 12,
  default: 12,
};
const PATTERN_LH_GAP_ADJUST = {
  stride: 6,
  walking: 5,
  pedal: -2,
  alberti: -1,
  "root-5th-oct": 2,
  "pop-8ths": 1,
  "power-8ths": 1,
};
const MIN_LH_RH_INTERVAL = 4;

function resolveDegreeNumber(token) {
  if (typeof token === "number" && Number.isFinite(token)) return token;
  const numeric = parseInt(String(token ?? "1").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : 1;
}

export function generateScale({ key, mode = "major" }) {
  const normalizedMode = SCALE_PATTERNS[mode] ? mode : "major";
  const definition = SCALE_PATTERNS[normalizedMode] || SCALE_PATTERNS.major;
  const pattern = definition?.intervals || SCALE_PATTERNS.major.intervals;
  const rootIndex = NOTE_TO_INDEX[key] ?? NOTE_TO_INDEX.C;
  const notes = pattern.map((step) => {
    const idx = (rootIndex + step) % 12;
    return NOTE_NAMES[idx];
  });

  return {
    key,
    root: key,
    name: `${key} ${definition?.label || MODE_LABELS.major}`,
    notes,
    mode: normalizedMode,
    intervals: pattern,
  };
}

export function generateProgression({ key, mode, length, progressionPresetId }, scale, styleProfile = null) {
  let preset = getProgressionPreset(progressionPresetId) || PROGRESSION_PRESETS[0];
  let baseRoman = preset.roman || [];
  if (!baseRoman.length) {
    preset = PROGRESSION_PRESETS[0];
    baseRoman = preset.roman;
  }
  const targetLength = length || baseRoman.length || 4;

  const roman = [];
  while (roman.length < targetLength) {
    roman.push(...baseRoman);
  }
  roman.length = targetLength;

  const resolvedMode = mode || scale?.mode;
  const bars = roman.map((symbol) => {
    const chord = buildChord(symbol, key, scale, {
      mode: resolvedMode,
      preferModeQuality: true,
      styleProfile,
      applyStyleOverrides: !!styleProfile,
    });
    const analysis = analyzeRomanAgainstMode(symbol, resolvedMode);
    return {
      ...chord,
      isDiatonic: analysis.isDiatonic,
      diatonicReason: analysis.reasonCode,
      diatonicReasonLabel: analysis.reasonLabel,
      diatonicRoman: analysis.diatonicRoman,
    };
  });
  return { roman, bars, length: targetLength };
}

export function generateCustomProgression(key, romanSequence, scale, mode, styleProfile = null) {
  const roman = romanSequence.slice();
  const resolvedMode = mode || scale?.mode;
  const bars = roman.map((symbol) => {
    const chord = buildChord(symbol, key, scale, {
      mode: resolvedMode,
      preferModeQuality: true,
      styleProfile,
      applyStyleOverrides: !!styleProfile,
    });
    const analysis = analyzeRomanAgainstMode(symbol, resolvedMode);
    return {
      ...chord,
      isDiatonic: analysis.isDiatonic,
      diatonicReason: analysis.reasonCode,
      diatonicReasonLabel: analysis.reasonLabel,
      diatonicRoman: analysis.diatonicRoman,
    };
  });
  return {
    roman,
    bars,
    length: bars.length,
  };
}

export function createPhrasePlan({
  key = "C",
  mode = "major",
  styleId = "classical",
  motifPatternId = "pop-hook-1351",
  leftHandPatternId = "block",
  anchors: anchorOverrides = {},
} = {}) {
  const styleAnchors = getStyleAnchors(styleId) || {};
  const styleStrategy = getLeftHandStyleStrategy(styleId);
  const motifStyle = MOTIF_STYLES[motifPatternId] || MOTIF_STYLES["pop-hook-1351"];
  const leftPatternMeta = LEFT_HAND_PATTERN_METADATA[leftHandPatternId] || LEFT_HAND_PATTERN_METADATA.block;

  const computedAnchors = computeDefaultHandAnchors({
    key,
    mode,
    styleId,
    motifStyle,
    leftHandPatternId,
    leftPatternMeta,
    styleAnchors,
  });

  const rawLhAnchor = anchorOverrides.lh || computedAnchors.lh;
  const rawRhAnchor = anchorOverrides.rh || computedAnchors.rh;
  const hasLhOverride = Boolean(anchorOverrides.lh);
  const hasRhOverride = Boolean(anchorOverrides.rh);
  const lhAnchorRange = anchorOverrides.lhRange || styleStrategy.anchorRange || styleAnchors.lh;
  const rhAnchorRange = styleAnchors.rh;
  let lhAnchorClamped = hasLhOverride
    ? ensureNoteWithOctave(rawLhAnchor, rawLhAnchor)
    : clampAnchorToRangeSpec(ensureNoteWithOctave(rawLhAnchor, rawLhAnchor), lhAnchorRange, "lh");
  const rhAnchorClamped = hasRhOverride
    ? ensureNoteWithOctave(rawRhAnchor, rawRhAnchor)
    : clampAnchorToRangeSpec(ensureNoteWithOctave(rawRhAnchor, rawRhAnchor), rhAnchorRange, "rh");

  const motifRange = estimateMotifRangeForAnchors({
    motifStyle,
    key,
    mode,
    rhAnchor: rhAnchorClamped,
  });

  if (!hasLhOverride) {
    lhAnchorClamped = applyLowKeyGuard({
      lhAnchor: lhAnchorClamped,
      motifRange,
      leftPatternMeta,
      styleAnchors,
      key,
      mode,
    });
  }

  let lhAnchorNote = hasLhOverride
    ? ensureNoteWithOctave(rawLhAnchor, rawLhAnchor)
    : adjustAnchorForPattern(lhAnchorClamped, leftHandPatternId);
  let rhAnchorNote = rhAnchorClamped;
  if (!hasLhOverride && !hasRhOverride) {
    let lhMidi = noteStringToMidiSafe(lhAnchorNote, lhAnchorNote);
    let rhMidi = noteStringToMidiSafe(rhAnchorNote, rhAnchorNote);
    const rhFloor = noteStringToMidiSafe(rhAnchorRange?.low || HAND_RANGE_SPECS.rh.soft.low, "G3");
    const lhCeiling = noteStringToMidiSafe(lhAnchorRange?.high || HAND_RANGE_SPECS.lh.soft.high, "C5");
    while (rhMidi - lhMidi > 30) {
      if (rhMidi - 12 >= rhFloor) {
        rhMidi -= 12;
        rhAnchorNote = midiToNote(rhMidi);
      } else if (lhMidi + 12 <= lhCeiling) {
        lhMidi += 12;
        lhAnchorNote = midiToNote(lhMidi);
      } else {
        break;
      }
    }
  }
  const lhAnchorMidi = noteStringToMidiSafe(lhAnchorNote, lhAnchorNote);
  const rhAnchorMidi = noteStringToMidiSafe(rhAnchorNote, rhAnchorNote);
  const chordAnchors = anchorOverrides.chords || anchorOverrides.lhChords || null;

  return {
    key,
    styleId,
    motifPatternId,
    leftHandPatternId,
    lh: {
      anchorNote: lhAnchorNote,
      anchorMidi: lhAnchorMidi,
      contour: "steady",
      intervalBias: leftPatternMeta.motionBias || "close",
      peaksPerPhrase: 0,
      anchorRange: styleAnchors.lh,
      chordAnchors,
    },
    rh: {
      anchorNote: rhAnchorNote,
      anchorMidi: rhAnchorMidi,
      contour: motifStyle.contour || "arch",
      intervalBias: motifStyle.intervalBias || motifStyle.motionBias || "steps",
      peaksPerPhrase: motifStyle.peaksPerPhrase || 1,
      targetRegister: motifStyle.targetRegister || rhAnchorNote,
      anchorRange: styleAnchors.rh,
    },
  };
}

export function generateMotif({ motifPatternId, styleId: playbackStyleId, phrasePlan }, scale) {
  if (motifPatternId === "none") return null;

  const patternId = motifPatternId || "pop-hook-1351";
  const style = MOTIF_STYLES[patternId] || MOTIF_STYLES["pop-hook-1351"];
  const playbackHints = getStylePlaybackHints(playbackStyleId || "classical", scale?.mode);
  const phraseSegment = phrasePlan?.rh || null;

  const rhythm = style.rhythm;
  const degreePattern = style.degreePattern;

  const motifRootNote = scale.notes[0];
  const motifTarget = phraseSegment?.anchorNote || style.targetRegister || "C5";
  const targetMotifMidi = noteStringToMidiSafe(motifTarget, "C5");
  const octaveBase = findClosestOctave(motifRootNote, targetMotifMidi);

  let cumulative = 0;
  const steps = [];

  rhythm.forEach((item, idx) => {
    const { beats, rest } = item;

    const step = {
      time: cumulative,
      beats,
      rest,
      duration: beatsToTone(beats),
    };

    if (!rest) {
      const degree = degreePattern[idx % degreePattern.length];
      const degreeNumber = resolveDegreeNumber(degree);
      const noteName = degreeToNote(degree, scale?.mode, scale);
      const stepsPerOctave = scale?.intervals?.length || scale?.notes?.length || 7;
      const octaveShift = Math.floor((degreeNumber - 1) / stepsPerOctave);
      const scaleIndex = ((degreeNumber - 1) % stepsPerOctave + stepsPerOctave) % stepsPerOctave;
      const scaleInterval = scale?.intervals?.[scaleIndex] ?? scaleIndex * 2;
      const rootMidi = noteToMidi(motifRootNote, octaveBase);
      const expectedMidi = rootMidi + octaveShift * 12 + scaleInterval;
      const noteOctave = findClosestOctave(noteName, expectedMidi);

      step.note = `${noteName}${noteOctave}`;
      step.degree = degree;
      step.label = durationToNotation(beats);
    } else {
      step.label = `${durationToNotation(beats)} (rest)`;
    }

    const relativeBeat = step.time % 4;
    step.dynamics = computeDynamics(relativeBeat, playbackHints);
    step.swingPosition = computeSwingPosition(relativeBeat, playbackHints);
    steps.push(step);
    cumulative += beats;
  });

  const motifAnchorMidi = phraseSegment?.anchorMidi ?? targetMotifMidi;
  const anchorAlignedSteps = alignStepsToAnchor(steps, motifAnchorMidi, "rh");
  const lockedSteps = lockStepsToRegister(anchorAlignedSteps);

  const motifState = createHandState(
    "rh",
    {
      defaultAnchor: style.targetRegister || "C5",
      maxSpan: style.maxSpan || 24,
      motionBias: style.intervalBias || "steps",
      peaksPerPhrase: style.peaksPerPhrase,
      contour: style.contour,
      intervalBias: style.intervalBias,
    },
    phraseSegment
  );
  motifState.metadata.totalNotes = lockedSteps.filter((s) => !s?.rest && (s.note || s.notes?.length)).length;
  const normalizedSteps = enforceHandRange(lockedSteps, motifState, { part: "rh", lockGlobalShift: true });

  const totalBeats = cumulative;
  const noteSteps = normalizedSteps.filter((s) => !s.rest);

  return {
    styleId: patternId,
    description: style.description,
    steps: normalizedSteps,
    degrees: noteSteps.map((s) => s.degree),
    rhythmLabels: steps.map((s) => s.label),
    degreeLabels: noteSteps.map((s) => `deg ${s.degree}`),
    noteLabels: noteSteps.map((s) => s.note.replace(/\d/g, "")),
    totalBeats,
  };
}


export function generateLeftHandPattern({ leftHand, difficulty, styleId, phrasePlan }, progression, mode) {
  const difficultyLevel = difficulty || "intermediate";
  const playbackHints = getStylePlaybackHints(styleId, mode);
  const patternMetadata = LEFT_HAND_PATTERN_METADATA[leftHand] || LEFT_HAND_PATTERN_METADATA.block;
  const phraseSegment = phrasePlan?.lh || null;
  const styleStrategy = getLeftHandStyleStrategy(styleId);
  const chordAnchors = phraseSegment?.chordAnchors || null;
  const handState = createHandState("lh", patternMetadata, phraseSegment);
  const voicingState = {
    lastRoot: handState.anchorMidi,
    lastCenter: handState.anchorMidi,
    lastMidis: null,
  };
  const bars = progression.bars.map((bar, idx) => {
    const barAnchorInfo = resolveBarAnchorInfo({
      bar,
      chordAnchors,
      fallbackNote: phraseSegment?.anchorNote,
      styleStrategy,
      patternType: leftHand,
    });
    const barAnchorMidi = barAnchorInfo.anchorMidi ?? handState.anchorMidi;
    if (idx === 0 && Number.isFinite(barAnchorMidi)) {
      handState.anchorMidi = barAnchorMidi;
      handState.lastMidi = barAnchorMidi;
      handState.centerMidi = barAnchorMidi;
    }
    const voicing = chooseVoicingForBar(
      bar,
      leftHand,
      patternMetadata,
      voicingState,
      barAnchorMidi,
      styleStrategy
    );
    const rawBar = buildPatternBar(
      bar,
      idx,
      leftHand,
      difficultyLevel,
      styleId,
      playbackHints,
      voicing,
      patternMetadata,
      handState,
      barAnchorMidi,
      barAnchorInfo
    );
    let adjustedSteps = enforceHandRange(rawBar.steps, handState, {
      part: "lh",
      barIndex: idx,
    });
    if (leftHand === "pop-8ths") {
      adjustedSteps = clampStepsToMidiRange(adjustedSteps, "C2", "C4");
    }
    return { ...rawBar, steps: adjustedSteps };
  });
  const nameMap = {
    alberti: "Alberti Bass",
    broken: "Broken Arpeggios",
    block: "Block Chords",
    oompah: "Oom-pah (Bass + Chords)",
    "root-5th-oct": "Root–5th–Octave Bass",
    "pop-8ths": "Pop 8ths (Root/Octave)",
    "power-8ths": "Power Fifths 8ths",
    pedal: "Pedal Root + Off-Beat Chords",
    stride: "Light Stride",
    walking: "Walking Bass (Advanced)",
  };
  return {
    name: nameMap[leftHand] || "Left-Hand Pattern",
    bars,
  };
}

function chooseVoicingType(patternType, styleId = "classical", bar = {}) {
  let base = "triad";

  if (styleId === "jazz") {
    base = patternType === "block" || patternType === "broken" ? "full" : "shell";
  }

  const hasSeventh = (bar.bassNotes || []).length >= 4 || /7$/.test(bar.quality || "");
  if (base === "triad" && hasSeventh && (patternType === "block" || patternType === "broken")) {
    return "full";
  }

  return base;
}

function getChordVoicing(bar, { type = "triad" } = {}) {
  const [root, third, fifth, seventh] = bar.bassNotes || [];

  let notes;
  switch (type) {
    case "shell":
      notes = [root, third, seventh || fifth || third].filter(Boolean);
      break;
    case "full":
      notes = seventh ? [root, third, fifth, seventh] : [root, third, fifth].filter(Boolean);
      break;
    case "triad":
    default:
      notes = [root, third, fifth].filter(Boolean);
      break;
  }

  const label = notes.length ? notes.map(stripOctave).join("-") : "";
  return { notes, label, type };
}

function buildPatternBar(
  bar,
  barIndex,
  type,
  difficulty,
  styleId = "classical",
  playbackHints = {},
  voicingOverride = null,
  patternMetadata = {},
  handState = null,
  barAnchorMidi = null,
  barAnchorInfo = null
) {
  const voicingType = chooseVoicingType(type, styleId, bar);
  const voicing = voicingOverride || getChordVoicing(bar, { type: voicingType });

  const root =
    (voicing.notes && voicing.notes[0]) ||
    (bar.bassNotes && bar.bassNotes[0]) ||
    null;
  const third =
    (voicing.notes && voicing.notes[1]) ||
    (bar.bassNotes && bar.bassNotes[1]) ||
    root;
  const fifth =
    (voicing.notes && voicing.notes[2]) ||
    (bar.bassNotes && bar.bassNotes[2]) ||
    third;
  const seventh =
    (voicing.notes && voicing.notes[3]) ||
    (bar.bassNotes && bar.bassNotes[3]) ||
    null;

  const pattern = {
    title: `Bar ${barIndex + 1} (${bar.label})`,
    description: "",
  };
  const steps = [];

  const NORMALIZED_TYPE_MAP = {
    "root-5th-octave": "root-5th-oct",
    "root-5th-oct": "root-5th-oct",
    "power-5ths-8ths": "power-8ths",
    "power-8ths": "power-8ths",
    "pedal-root-chords": "pedal",
    pedal: "pedal",
    "light-stride": "stride",
    stride: "stride",
    oompah: "oompah",
  };
  const normalizedType = NORMALIZED_TYPE_MAP[type] || type;

  const baseBeats = barIndex * 4;
  function scheduleBeat(beatOffset, payload) {
    const totalBeats = baseBeats + beatOffset;
    const beats = payload.beats ?? toneToBeatsFromDuration(payload.duration || "4n");
    const duration = payload.duration || beatsToTone(beats);
    const dynamics = computeDynamics(beatOffset, playbackHints);
    const swingPosition = computeSwingPosition(beatOffset, playbackHints);
    steps.push({ time: totalBeats, beats, duration, swingPosition, dynamics, registerLocked: lockRegisterSteps || payload.registerLocked, ...payload });
  }

  function withOctave(noteStr, octave) {
    if (!noteStr) return `C${octave}`;
    if (/\d/.test(noteStr)) return noteStr.replace(/\d/, String(octave));
    return `${noteStr}${octave}`;
  }

  function safeRootNote() {
    if (root) return root;
    if (bar.bassNotes && bar.bassNotes.length) return bar.bassNotes[0];
    if (voicing.notes && voicing.notes.length) return voicing.notes[0];
    if (bar.root) return `${bar.root}3`;
    return "C3";
  }

  const rootSafe = safeRootNote();
  const normalizedMetadata = patternMetadata || {};
  const lockRegisterSteps = !!normalizedMetadata.lockRegister;
  const anchorMidi = (Number.isFinite(barAnchorMidi) ? barAnchorMidi : handState?.anchorMidi) ?? noteStringToMidiSafe(normalizedMetadata.defaultAnchor || "C3", normalizedMetadata.defaultAnchor || "C3");
  const anchorStrict = Boolean(barAnchorInfo?.strict);
  const preferAnchorFlats = barAnchorInfo?.preferredAccidental === "flat";
  const bassOffset = normalizedMetadata.bassOffset ?? 0;
  const highOffset = normalizedMetadata.highOffset ?? 12;
  const chordOffset = normalizedMetadata.chordOffset ?? 12;

  function snapMidiNearTarget(midi, target) {
    if (!Number.isFinite(midi) || !Number.isFinite(target)) return midi;
    const candidates = [-24, -12, 0, 12, 24].map((shift) => midi + shift);
    let best = candidates[0];
    let bestDiff = Math.abs(best - target);
    for (const candidate of candidates) {
      const diff = Math.abs(candidate - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = candidate;
      }
    }
    return best;
  }

  function alignNoteToAnchor(noteStr, offset = 0, options = {}) {
    const target = anchorMidi + offset;
    const preferFlats = resolvePreferFlat(options.preferFlats, noteStr, preferAnchorFlats);
    const fallbackNote = midiToNote(target, preferFlats);
    const midi = noteStringToMidiSafe(noteStr || fallbackNote, fallbackNote);
    const snapped = options.forceAnchorName ? target : snapMidiNearTarget(midi, target);
    return midiToNote(snapped, preferFlats);
  }

  const rootMidiBase = noteStringToMidiSafe(rootSafe, rootSafe);

  function intervalFromRoot(noteStr) {
    if (!noteStr) return 0;
    const midi = noteStringToMidiSafe(noteStr, noteStr);
    return ((midi - rootMidiBase) % 12 + 12) % 12;
  }

  function alignChordNotesLocal(notes = []) {
    if (!notes.length) return [];
    return notes.map((note, idx) => {
      const interval = idx === 0 ? 0 : intervalFromRoot(note);
      const offset = chordOffset + interval;
      return alignNoteToAnchor(note, offset, {
        forceAnchorName: anchorStrict && idx === 0,
        preferFlats: preferAnchorFlats,
      });
    });
  }

  const chordNotesRaw =
    (bar.chordNotes && bar.chordNotes.length) ? bar.chordNotes :
    (voicing.notes && voicing.notes.length)   ? voicing.notes   :
    [rootSafe, third, fifth].filter(Boolean);
  const chordNotesAnchored = alignChordNotesLocal(chordNotesRaw);
  const thirdInterval = third ? intervalFromRoot(third) : 4;
  const fifthInterval = fifth ? intervalFromRoot(fifth) : 7;
  const seventhInterval = seventh ? intervalFromRoot(seventh) : 10;
  const chordRootNote = chordNotesAnchored[0] || alignNoteToAnchor(rootSafe, chordOffset);
  const chordThirdNote =
    chordNotesAnchored[1] ||
    alignNoteToAnchor(third || rootSafe, chordOffset + thirdInterval, {
      preferFlats: preferAnchorFlats,
    });
  const chordFifthNote =
    chordNotesAnchored[2] ||
    alignNoteToAnchor(fifth || rootSafe, chordOffset + fifthInterval, {
      preferFlats: preferAnchorFlats,
    });
  const chordSeventhNote =
    chordNotesAnchored[3] ||
    alignNoteToAnchor(seventh || fifth || rootSafe, chordOffset + seventhInterval, {
      preferFlats: preferAnchorFlats,
    });
  const chordNotesForPlayback = chordNotesAnchored.length
    ? chordNotesAnchored
    : [chordRootNote, chordThirdNote, chordFifthNote, chordSeventhNote].filter(Boolean);
  const chordNotes = chordNotesForPlayback;
  const anchoredChordDisplay = chordNotes.map(stripOctave).join("-");
  const anchorOptions = { forceAnchorName: anchorStrict, preferFlats: preferAnchorFlats };
  const bassRootNote = alignNoteToAnchor(rootSafe, bassOffset, anchorOptions);
  const bassFifthNote = alignNoteToAnchor(fifth || rootSafe, bassOffset + fifthInterval, {
    preferFlats: preferAnchorFlats,
  });
  const bassOctaveNote = alignNoteToAnchor(rootSafe, bassOffset + 12, anchorOptions);
  const upperRootNote = alignNoteToAnchor(rootSafe, highOffset, anchorOptions);

  if (normalizedType === "alberti") {
    const motif = [
      bassRootNote,
      chordFifthNote || chordThirdNote || chordRootNote,
      chordThirdNote || chordRootNote,
      chordFifthNote || chordThirdNote || chordRootNote,
    ].filter(Boolean);

    const subdivision = difficulty === "advanced" ? 0.25 : 0.5;
    const duration = subdivision === 0.25 ? "16n" : "8n";
    const feel = subdivision === 0.25 ? "sixteenths" : "eighths";
    const totalSteps = Math.round(4 / subdivision);

    let beat = 0;
    for (let i = 0; i < totalSteps; i++) {
      scheduleBeat(beat, { note: motif[i % motif.length], duration });
      beat += subdivision;
    }

    const motifNames = motif.map(stripOctave);
    pattern.description = `${bar.label}: ${motifNames.join(" - ")} (${voicingType}) in ${feel}`;
  } else if (normalizedType === "broken") {
    const baseSeq =
      voicing.notes && voicing.notes.length
        ? voicing.notes
        : [rootSafe, third, fifth].filter(Boolean);

    const topNote =
      baseSeq.length && baseSeq[0]
        ? withOctave(baseSeq[0], 4)
        : withOctave(bar.root || stripOctave(rootSafe || "C"), 4);

    const seqBase = baseSeq.length < 4 ? [...baseSeq, topNote] : baseSeq;
    const seq = seqBase.map((note, idx) => {
      if (idx === 0) return bassRootNote;
      const isTop = idx === seqBase.length - 1 && seqBase.length > baseSeq.length;
      if (isTop) return upperRootNote;
      return alignNoteToAnchor(note, chordOffset + intervalFromRoot(note), {
        forceAnchorName: anchorStrict && stripOctave(note) === stripOctave(rootSafe),
        preferFlats: preferAnchorFlats,
      });
    });

    let beat = 0;
    const subdivision = 0.5;
    const duration = "8n";

    while (beat < 4 - 1e-6) {
      for (const note of seq) {
        if (beat >= 4 - 1e-6) break;
        scheduleBeat(beat, { note, duration });
        beat += subdivision;
      }
    }

    pattern.description = `${bar.label}: broken ${anchoredChordDisplay} (${voicingType})`;
  } else if (normalizedType === "block") {
    const displayLabel = chordNotes.map(stripOctave).join("-");
    scheduleBeat(0, { notes: chordNotes, duration: "1m" });
    pattern.description = `${bar.label}: block ${displayLabel} (full chord)`;
  } else if (normalizedType === "oompah") {
    const bassNote = bassRootNote;

    scheduleBeat(0, { note: bassNote, duration: "4n" });
    for (let b = 1; b <= 3; b++) {
      scheduleBeat(b, { notes: chordNotes, duration: "4n" });
    }

    pattern.description = `${bar.label}: bass ${stripOctave(bassNote)} + chord ${anchoredChordDisplay} (${voicingType})`;
  } else if (normalizedType === "root-5th-oct") {
    const seq = [
      bassRootNote,
      bassFifthNote,
      bassOctaveNote,
      bassFifthNote,
    ];

    seq.forEach((note, i) => {
      scheduleBeat(i, { note, duration: "4n" });
    });

    pattern.description = `${bar.label}: root–5th–octave in quarters`;
  } else if (normalizedType === "pop-8ths") {
    const rootLow = bassRootNote;
    const rootHigh = upperRootNote;

    let beat = 0;
    while (beat < 4 - 1e-6) {
      const even = Math.round(beat * 2) % 2 === 0;
      const note = even ? rootLow : rootHigh;
      scheduleBeat(beat, { note, duration: "8n" });
      beat += 0.5;
    }

    pattern.description = `${bar.label}: pop 8ths on root/octave (${stripOctave(rootLow)} / ${stripOctave(rootHigh)})`;
  } else if (normalizedType === "power-8ths") {
    const rootLow = bassRootNote;
    const dyad = [rootLow, bassFifthNote];

    let beat = 0;
    while (beat < 4 - 1e-6) {
      scheduleBeat(beat, { notes: dyad, duration: "8n" });
      beat += 0.5;
    }

    pattern.description = `${bar.label}: power-fifths 8ths (${stripOctave(dyad[0])}–${stripOctave(dyad[1])})`;
  } else if (normalizedType === "pedal") {
    const rootLow = bassRootNote;

    scheduleBeat(0, { note: rootLow, duration: "2n" });
    scheduleBeat(2, { note: rootLow, duration: "2n" });
    scheduleBeat(1.5, { notes: chordNotes, duration: "8n" });
    scheduleBeat(3.5, { notes: chordNotes, duration: "8n" });

    pattern.description = `${bar.label}: pedal ${stripOctave(rootLow)} with off-beat chords (${anchoredChordDisplay})`;
  } else if (normalizedType === "stride") {
    const rootLow = bassRootNote;

    scheduleBeat(0, { note: rootLow, duration: "4n" });
    scheduleBeat(1.5, { notes: chordNotes, duration: "4n" });
    scheduleBeat(2, { note: rootLow, duration: "4n" });
    scheduleBeat(3.5, { notes: chordNotes, duration: "4n" });

    pattern.description = `${bar.label}: light stride bass ${stripOctave(rootLow)} + chords (${anchoredChordDisplay})`;
  } else if (normalizedType === "walking") {
    const seq = [
      bassRootNote,
      alignNoteToAnchor(third || rootSafe, bassOffset + thirdInterval, { preferFlats: preferAnchorFlats }),
      alignNoteToAnchor(fifth || rootSafe, bassOffset + fifthInterval, { preferFlats: preferAnchorFlats }),
      alignNoteToAnchor(seventh || rootSafe, bassOffset + seventhInterval, { preferFlats: preferAnchorFlats }),
    ].filter(Boolean);

    const useSeq = seq.length ? seq : [bassRootNote];

    for (let b = 0; b < 4; b++) {
      const note = useSeq[b % useSeq.length];
      scheduleBeat(b, { note, duration: "4n" });
    }

    pattern.description = `${bar.label}: walking bass through chord tones (${useSeq.map(stripOctave).join("-")})`;
  } else {
    const bassNote = bassRootNote;

    scheduleBeat(0, { note: bassNote, duration: "4n" });
    for (let b = 1; b <= 3; b++) {
      scheduleBeat(b, { notes: chordNotes, duration: "4n" });
    }

    pattern.description = `${bar.label}: bass ${stripOctave(bassNote)} + chord ${anchoredChordDisplay} (${voicingType})`;
  }

  const registerSafeSteps = clampStepsToComfortRange(steps, handState?.part || "lh");
  return { ...pattern, steps: registerSafeSteps };
}

function chooseVoicingForBar(bar, patternType, patternMetadata, voicingState, anchorMidiOverride, styleStrategy) {
  const voicingType = chooseVoicingType(patternType, bar.styleId || "classical", bar);
  const baseVoicing = getChordVoicing(bar, { type: voicingType });
  const rawNotes = baseVoicing.notes && baseVoicing.notes.length ? baseVoicing.notes : bar.chordNotes;
  if (!rawNotes || !rawNotes.length) {
    return baseVoicing;
  }

  const anchorMidi = anchorMidiOverride ?? voicingState.lastCenter ?? noteStringToMidiSafe(patternMetadata.defaultAnchor, "C3");
  const candidates = buildStyleVoicingCandidates({
    bar,
    rawNotes,
    patternType,
    patternMetadata,
    anchorMidi,
    styleStrategy,
  });

  let best = null;
  for (const candidate of candidates) {
    const penalty = scoreVoicingCandidate(candidate, {
      patternMetadata,
      styleStrategy,
      anchorMidi,
      voicingState,
    });
    if (!best || penalty < best.penalty) {
      best = { candidate, penalty };
    }
  }

  const chosen = best?.candidate || candidates[0];
  const chosenMidis = chosen?.midis?.length ? chosen.midis : rawNotes.map((note) => noteStringToMidiSafe(note, patternMetadata.defaultAnchor));
  const chosenNotes = chosen?.notes?.length ? chosen.notes : chosenMidis.map((midi) => midiToNote(midi));
  const label = chosenNotes.map(stripOctave).join("-");

  if (chosenMidis.length) {
    voicingState.lastRoot = chosenMidis[0];
    voicingState.lastCenter = average(chosenMidis);
    voicingState.lastMidis = chosenMidis.slice();
  }

  return {
    ...baseVoicing,
    notes: chosenNotes,
    label,
  };
}

function resolveBarAnchorInfo({ bar, chordAnchors, fallbackNote, styleStrategy, patternType }) {
  const chordAnchorNote = matchChordAnchorFromMap(chordAnchors, bar?.symbol);
  const baseNote = chordAnchorNote || fallbackNote || "C3";
  const clamped = clampAnchorToRangeSpec(baseNote, styleStrategy?.anchorRange, "lh");
  let anchorMidi = noteStringToMidiSafe(clamped, clamped);
  anchorMidi = adjustAnchorMidiForPattern(anchorMidi, patternType);
  const preferFlat = prefersFlatNotation(chordAnchorNote || baseNote);
  const anchorNote = midiToNote(anchorMidi, preferFlat);
  return {
    anchorNote,
    anchorMidi,
    strict: Boolean(chordAnchorNote),
    preferredAccidental: preferFlat ? "flat" : "sharp",
  };
}

function matchChordAnchorFromMap(chordAnchors, symbol) {
  if (!chordAnchors || !symbol) return null;
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
    if (key && chordAnchors[key] != null) {
      return chordAnchors[key];
    }
  }
  return null;
}

function buildStyleVoicingCandidates({ bar, rawNotes, patternType, patternMetadata, anchorMidi, styleStrategy }) {
  const fallbackAnchor = patternMetadata.defaultAnchor || "C3";
  const baseMidis = rawNotes.map((note) => noteStringToMidiSafe(note, fallbackAnchor));
  const parsedRoman = bar?.symbol ? parseRomanSymbol(bar.symbol) : null;
  const allowedShapes = patternMetadata.allowedShapes?.length ? patternMetadata.allowedShapes : styleStrategy?.allowedShapes || ["triad"];
  const allowedInversions = resolveAllowedInversions({
    patternType,
    patternMetadata,
    styleStrategy,
    parsedRoman,
  });
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (midis, meta = {}) => {
    if (!midis || !midis.length) return;
    const normalized = clampCandidateToRegister(midis, styleStrategy);
    const key = normalized.map((m) => Math.round(m)).join("-");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      midis: normalized,
      notes: normalized.map((m) => midiToNote(m)),
      shape: meta.shape || "triad",
      inversion: meta.inversion || null,
    });
  };

  if (allowedShapes.includes("triad") && baseMidis.length) {
    const triadSource = baseMidis.slice(0, 3);
    allowedInversions.forEach((inv) => {
      const triad = applyTriadInversion(triadSource, inv);
      pushCandidate(triad, { shape: "triad", inversion: inv });
    });
  }

  if (allowedShapes.includes("open5")) {
    const open = buildOpenFifthCandidate(baseMidis, styleStrategy?.includeSeventhInOpen);
    pushCandidate(open, { shape: "open5" });
  }

  if (allowedShapes.includes("shell")) {
    const shell = buildShellCandidate(baseMidis, styleStrategy?.shellOptions || {});
    pushCandidate(shell, { shape: "shell" });
  }

  if (allowedShapes.includes("quartal")) {
    const quartal = buildQuartalCandidate(baseMidis[0]);
    pushCandidate(quartal, { shape: "quartal" });
  }

  if (!candidates.length) {
    pushCandidate(baseMidis, { shape: "triad" });
  }

  return candidates;
}

function resolveAllowedInversions({ patternType, patternMetadata, styleStrategy, parsedRoman }) {
  const patternLock = patternMetadata.allowedInversions?.length ? patternMetadata.allowedInversions : null;
  let allowed = patternLock || styleStrategy?.allowedInversions || ["root"];
  if (styleStrategy?.lockRootPatterns?.includes(patternType)) {
    allowed = ["root"];
  }

  const romanPreference = determineRomanPreferredInversion(styleStrategy, parsedRoman);
  if (romanPreference && allowed.includes(romanPreference)) {
    allowed = [romanPreference, ...allowed.filter((inv) => inv !== romanPreference)];
  }

  if (
    styleStrategy?.forceFirstInversionOnDiminished &&
    parsedRoman &&
    /vii/i.test(parsedRoman.numeral || "")
  ) {
    allowed = ["first"];
  }

  return allowed;
}

function determineRomanPreferredInversion(strategy, parsedRoman) {
  if (!strategy?.defaultInversionByRoman || !parsedRoman) return null;
  const numeral = (parsedRoman.numeral || "I").replace(/[^IViv]/g, "");
  const variants = [
    `${parsedRoman.accStr || ""}${numeral}`,
    numeral,
    numeral.toUpperCase(),
    numeral.toLowerCase(),
  ];
  for (const key of variants) {
    if (!key) continue;
    const preferred = strategy.defaultInversionByRoman[key];
    if (preferred) return preferred;
  }
  return null;
}

function applyTriadInversion(sourceMidis = [], inversion = "root") {
  if (!sourceMidis.length) return null;
  const triad = sourceMidis.slice();
  while (triad.length < 3) {
    triad.push(triad[triad.length - 1] + 12);
  }
  for (let i = 1; i < triad.length; i++) {
    while (triad[i] <= triad[i - 1]) {
      triad[i] += 12;
    }
  }
  const inversionSteps = inversion === "first" ? 1 : inversion === "second" ? 2 : 0;
  for (let i = 0; i < inversionSteps; i++) {
    const note = triad.shift();
    triad.push(note + 12);
  }
  return normalizeAscending(triad);
}

function buildOpenFifthCandidate(baseMidis = [], includeSeventh = false) {
  if (!baseMidis.length) return null;
  const root = baseMidis[0];
  const fifth = baseMidis[2] ?? root + 7;
  const notes = [root, fifth];
  if (includeSeventh) {
    const seventh = baseMidis[3] ?? root + 10;
    notes.push(seventh);
  }
  return normalizeAscending(notes);
}

function buildShellCandidate(baseMidis = [], options = {}) {
  if (!baseMidis.length) return null;
  const root = baseMidis[0];
  const third = baseMidis[1] ?? root + 4;
  const fifth = baseMidis[2] ?? root + 7;
  const seventh = baseMidis[3] ?? root + 10;
  const notes = [third, fifth, seventh].filter((value) => Number.isFinite(value));
  if (options.addThirteen) {
    notes.push(root + 21);
  }
  return normalizeAscending(notes);
}

function buildQuartalCandidate(rootMidi) {
  if (!Number.isFinite(rootMidi)) return null;
  return normalizeAscending([rootMidi, rootMidi + 5, rootMidi + 10]);
}

function clampCandidateToRegister(midis = [], strategy = {}) {
  if (!midis.length) return midis;
  const preferred = strategy.preferredRegister;
  if (!preferred || !preferred.low || !preferred.high) {
    return normalizeAscending(midis);
  }
  const min = noteStringToMidiSafe(preferred.low, preferred.low);
  const max = noteStringToMidiSafe(preferred.high, preferred.high);
  let candidate = midis.slice();
  let guard = 0;
  while (guard < 8) {
    const center = average(candidate);
    if (center < min) {
      candidate = candidate.map((m) => m + 12);
    } else if (center > max) {
      candidate = candidate.map((m) => m - 12);
    } else {
      break;
    }
    guard += 1;
  }
  return normalizeAscending(candidate);
}

function scoreVoicingCandidate(candidate, { patternMetadata, styleStrategy, anchorMidi, voicingState }) {
  const midis = candidate.midis || [];
  if (!midis.length) return Number.POSITIVE_INFINITY;
  const span = Math.max(...midis) - Math.min(...midis);
  const center = average(midis);
  const root = midis[0];
  const lastRoot = voicingState.lastRoot ?? anchorMidi;
  const register = styleStrategy?.preferredRegister;
  let registerPenalty = 0;
  if (register && register.low && register.high) {
    const min = noteStringToMidiSafe(register.low, register.low);
    const max = noteStringToMidiSafe(register.high, register.high);
    if (center < min) registerPenalty = (min - center) * 2.5;
    else if (center > max) registerPenalty = (center - max) * 2.5;
  }
  const spanLimit = patternMetadata.maxSpan || 14;
  const spanPenalty = span > spanLimit ? (span - spanLimit) * 3 : 0;
  const movementPenalty = Math.abs(root - lastRoot);
  const anchorPenalty = Math.abs(center - anchorMidi) * 0.25;
  const inversionPenalty = candidate.inversion === "second" && !(styleStrategy?.allowedInversions || []).includes("second") ? 6 : 0;
  return registerPenalty + spanPenalty + movementPenalty * 0.9 + anchorPenalty + inversionPenalty;
}

function normalizeAscending(midis = []) {
  const sorted = midis.slice().sort((a, b) => a - b);
  const result = [];
  for (const value of sorted) {
    let adjusted = value;
    while (result.length && adjusted <= result[result.length - 1]) {
      adjusted += 12;
    }
    result.push(adjusted);
  }
  return result;
}

function enforceHandRange(steps = [], state, { part, lockGlobalShift = false } = {}) {
  if (!Array.isArray(steps) || !state) return steps;
  const rangeKey = part || state.part || "rh";
  const ranges = HAND_RANGE_MAP[rangeKey] || HAND_RANGE_MAP.rh;
  let attempt = 0;
  const working = steps;
  while (attempt < MAX_BAR_SHIFT_ATTEMPTS) {
    const result = adjustStepsWithShift(working, state, ranges, { lockGlobalShift });
    if (result.needShift && result.shiftDelta) {
      if (lockGlobalShift) {
        return working;
      }
      state.globalShift += result.shiftDelta;
      state.anchorMidi = (state.anchorMidi || 0) + result.shiftDelta;
      state.centerMidi = (state.centerMidi || 0) + result.shiftDelta;
      attempt += 1;
      continue;
    }
    if (result.steps) {
      state.lastMidi = result.lastMidi ?? state.lastMidi;
      state.centerMidi = result.center ?? state.centerMidi;
      state.noteIndex = (state.noteIndex || 0) + (result.noteCount || 0);
      state.peaksUsed = (state.peaksUsed || 0) + (result.peaks || 0);
      return result.steps;
    }
    break;
  }
  return working;
}

function adjustStepsWithShift(steps, state, ranges, options = {}) {
  const metadata = state.metadata || {};
  const adjusted = [];
  const barMidis = [];
  let lastMidi = state.lastMidi ?? state.anchorMidi;
  const baseNoteIndex = state.noteIndex || 0;
  let localNoteCount = 0;
  let peakCount = 0;

  for (const step of steps) {
    if (!step || step.rest || (!step.note && !step.notes?.length)) {
      adjusted.push(step);
      continue;
    }

    const notesArray = step.notes && step.notes.length ? step.notes : [step.note];
    const noteOrdinal = baseNoteIndex + localNoteCount;
    const outcome = adjustNoteCollection(
      notesArray,
      lastMidi,
      state.globalShift,
      ranges,
      metadata,
      state,
      noteOrdinal,
      step
    );
    if (!outcome.ok) {
      return { needShift: true, shiftDelta: outcome.shiftDelta };
    }

    if (step.notes && step.notes.length) {
      adjusted.push({ ...step, notes: outcome.notes });
    } else {
      adjusted.push({ ...step, note: outcome.notes[0] });
    }

    if (outcome.midis.length) {
      lastMidi = outcome.midis[outcome.midis.length - 1];
      barMidis.push(...outcome.midis);
      localNoteCount += outcome.noteContribution || 1;
      if (outcome.peakUsed) {
        peakCount += 1;
      }
    }
  }

  const center = barMidis.length ? average(barMidis) : state.centerMidi ?? lastMidi;
  if (!options.lockGlobalShift && center != null) {
    if (center < ranges.comfort.min - 0.5) {
      return { needShift: true, shiftDelta: 12 };
    }
    if (center > ranges.comfort.max + 0.5) {
      return { needShift: true, shiftDelta: -12 };
    }
  }

  return { steps: adjusted, lastMidi, center, noteCount: localNoteCount, peaks: peakCount };
}

function adjustNoteCollection(notes, lastMidi, globalShift, ranges, metadata, state, noteOrdinal = 0, step = null) {
  const part = state.part || "rh";
  const fallbackAnchor = metadata.defaultAnchor || (part === "lh" ? "C3" : "C5");
  const baseMidis = notes.map((note) => noteStringToMidiSafe(note, fallbackAnchor));
  const shiftedBase = baseMidis.map((midi) => midi + globalShift);
  if (step?.registerLocked) {
    const lockedMidis = clampLockedMidisToRange(shiftedBase, ranges);
    return {
      ok: true,
      notes: lockedMidis.map((midi) => midiToNote(midi)),
      midis: lockedMidis,
      peakUsed: false,
      noteContribution: 1,
    };
  }
  const decision = chooseBestShiftForMidis(shiftedBase, lastMidi, ranges, metadata, state, noteOrdinal);
  if (!decision) {
    const avg = average(shiftedBase);
    const shiftDelta = avg > ranges.soft.max ? -12 : 12;
    return { ok: false, shiftDelta };
  }
  return {
    ok: true,
    notes: decision.midis.map((midi) => midiToNote(midi)),
    midis: decision.midis,
    peakUsed: decision.isPeak || false,
    noteContribution: 1,
  };
}

function clampLockedMidisToRange(midis = [], ranges) {
  if (!midis.length) return midis;
  const soft = ranges?.soft;
  if (!soft) return midis;
  let result = midis.slice();
  let guard = 0;
  const min = soft.min;
  const max = soft.max;
  while (guard < 8) {
    const below = result.some((m) => m < min);
    const above = result.some((m) => m > max);
    if (!below && !above) break;
    if (below) {
      result = result.map((m) => m + 12);
    } else if (above) {
      result = result.map((m) => m - 12);
    }
    guard += 1;
  }
  return result;
}

function chooseBestShiftForMidis(midis, lastMidi, ranges, metadata, state, noteOrdinal = 0) {
  const shiftOptions = [0, -12, 12, -24, 24];
  const motionWeight = motionBiasWeight(metadata.motionBias || metadata.intervalBias);
  let best = null;

  for (const shift of shiftOptions) {
    const candidate = midis.map((m) => m + shift);
    if (!candidate.every((m) => m >= ranges.soft.min && m <= ranges.soft.max)) continue;

    const span = Math.max(...candidate) - Math.min(...candidate);
    if (metadata.maxSpan && span > metadata.maxSpan) continue;

    const comfortViolations = candidate.filter((m) => m < ranges.comfort.min || m > ranges.comfort.max).length;
    const anchor = candidate[0];
    const movement = lastMidi != null ? anchor - lastMidi : 0;
    const distance = Math.abs(movement);
    const contourDir = determineContourDirection(state, noteOrdinal);
    const contourPenalty = computeContourPenalty(contourDir, movement);
    const intervalPenalty = computeIntervalPenalty(metadata.intervalBias || metadata.motionBias, distance);
    const isPeak = candidate.some((m) => m > ranges.comfort.max - 1.5);
    const peakPenalty = computePeakPenalty(state, isPeak);
    const penalty =
      distance * motionWeight +
      comfortViolations * 200 +
      Math.abs(shift) * 0.1 +
      contourPenalty +
      intervalPenalty +
      peakPenalty;

    if (!best || penalty < best.penalty) {
      best = { shift, midis: candidate, penalty, isPeak };
    }
  }

  return best;
}

function motionBiasWeight(bias) {
  switch (bias) {
    case "leap-on-barlines":
      return 0.7;
    case "static":
    case "steady":
      return 1.15;
    case "arpeggio":
    case "stepwise":
    case "steps":
    default:
      return 1;
  }
}

function determineContourDirection(state, noteOrdinal = 0) {
  const contour = state?.metadata?.contour;
  if (!contour) return 0;
  const total = Math.max(1, state?.metadata?.totalNotes || 1);
  const denom = Math.max(1, total - 1);
  const ratio = Math.min(1, noteOrdinal / denom);
  switch (contour) {
    case "up":
      return 1;
    case "down":
      return -1;
    case "arch":
      return ratio < 0.5 ? 1 : -1;
    case "static":
    default:
      return 0;
  }
}

function computeContourPenalty(direction, movement) {
  if (!direction || !Number.isFinite(movement)) return 0;
  if (direction > 0 && movement < 0) {
    return Math.abs(movement) * 2.5;
  }
  if (direction < 0 && movement > 0) {
    return movement * 2.5;
  }
  if (Math.abs(movement) < 0.5) {
    return 0.2;
  }
  return 0;
}

function computeIntervalPenalty(bias, distance) {
  if (!bias || !Number.isFinite(distance)) return 0;
  if (bias === "steps" || bias === "stepwise") {
    return Math.max(0, distance - 3) * 0.9;
  }
  if (bias === "thirds") {
    return Math.max(0, distance - 5) * 0.6;
  }
  if (bias === "steady" || bias === "static") {
    return Math.max(0, distance - 2) * 1.2;
  }
  return 0;
}

function clampStepsToComfortRange(steps = [], part = "lh") {
  if (!Array.isArray(steps) || !steps.length) return steps;
  const ranges = HAND_RANGE_MAP[part] || HAND_RANGE_MAP.rh;
  const comfort = ranges?.comfort;
  if (!comfort) return steps;
  const soft = ranges?.soft;
  const stats = gatherStepMidiStats(steps);
  if (!stats) return steps;

  let min = stats.min;
  let max = stats.max;
  let delta = 0;
  let guard = 0;

  while (max > comfort.max && guard < 8) {
    max -= 12;
    min -= 12;
    delta -= 12;
    guard += 1;
  }

  while (min < comfort.min && guard < 16) {
    min += 12;
    max += 12;
    delta += 12;
    guard += 1;
  }

  if (soft) {
    while (min < soft.min && guard < 24) {
      min += 12;
      max += 12;
      delta += 12;
      guard += 1;
    }
    while (max > soft.max && guard < 32) {
      max -= 12;
      min -= 12;
      delta -= 12;
      guard += 1;
    }
  }

  if (delta === 0) return steps;
  return steps.map((step) => transposeStep(step, delta));
}

function clampStepsToMidiRange(steps = [], lowNote, highNote) {
  const stats = gatherStepMidiStats(steps);
  if (!stats) return steps;
  const minAllowed = noteStringToMidiSafe(lowNote, lowNote);
  const maxAllowed = noteStringToMidiSafe(highNote, highNote);
  let min = stats.min;
  let max = stats.max;
  let delta = 0;

  while (max > maxAllowed) {
    max -= 12;
    min -= 12;
    delta -= 12;
  }
  while (min < minAllowed) {
    min += 12;
    max += 12;
    delta += 12;
  }

  return delta ? steps.map((step) => transposeStep(step, delta)) : steps;
}

function alignStepsToAnchor(steps = [], anchorMidi, part = "rh") {
  if (!Array.isArray(steps) || !steps.length || !Number.isFinite(anchorMidi)) return steps;
  const stats = gatherStepMidiStats(steps);
  if (!stats) return steps;
  const ranges = HAND_RANGE_MAP[part] || HAND_RANGE_MAP.rh;
  const comfort = ranges?.comfort;
  const soft = ranges?.soft;
  const candidates = [0, -12, 12, -24, 24];
  let bestShift = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const shift of candidates) {
    const shiftedMin = stats.min + shift;
    const shiftedMax = stats.max + shift;
    if (soft) {
      if (shiftedMin < soft.min || shiftedMax > soft.max) continue;
    }
    let score = Math.abs(stats.avg + shift - anchorMidi) + Math.abs(shift) * 0.1;
    if (comfort) {
      if (shiftedMin < comfort.min) score += (comfort.min - shiftedMin) * 4;
      if (shiftedMax > comfort.max) score += (shiftedMax - comfort.max) * 4;
    }
    if (score < bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  if (bestShift === 0) return steps;
  return steps.map((step) => transposeStep(step, bestShift));
}

function lockStepsToRegister(steps = []) {
  return steps.map((step) => {
    if (!step || step.rest || (!step.note && !step.notes?.length)) return step;
    return { ...step, registerLocked: true };
  });
}

function gatherStepMidiStats(steps = []) {
  const midis = [];
  for (const step of steps) {
    if (!step || step.rest) continue;
    const pool = step.notes && step.notes.length ? step.notes : step.note ? [step.note] : null;
    if (!pool) continue;
    pool.forEach((note) => {
      midis.push(noteStringToMidiSafe(note, note));
    });
  }
  if (!midis.length) return null;
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  const avg = midis.reduce((sum, value) => sum + value, 0) / midis.length;
  return { min, max, avg };
}

function transposeStep(step, delta = 0) {
  if (!step || !delta) return step;
  const shiftNote = (note) => midiToNote(noteStringToMidiSafe(note, note) + delta);
  if (step.notes && step.notes.length) {
    return { ...step, notes: step.notes.map(shiftNote) };
  }
  if (step.note) {
    return { ...step, note: shiftNote(step.note) };
  }
  return step;
}

function resolvePreferFlat(override, noteStr, fallback = false) {
  if (typeof override === "boolean") return override;
  if (noteStr) return prefersFlatNotation(noteStr);
  return fallback;
}

function prefersFlatNotation(noteStr) {
  if (!noteStr) return false;
  return /[A-G]b/i.test(noteStr);
}

function computePeakPenalty(state, isPeak) {
  if (!isPeak) return 0;
  const limit = state?.metadata?.peaksPerPhrase;
  if (!limit) return 0;
  const used = state?.peaksUsed || 0;
  return used >= limit ? 400 + (used - limit + 1) * 25 : 0;
}

function createHandState(part, metadata = {}, phraseSegment = null) {
  const defaultAnchor = phraseSegment?.anchorNote || metadata.defaultAnchor || (part === "lh" ? "C3" : "C5");
  const anchorMidi = phraseSegment?.anchorMidi ?? noteStringToMidiSafe(defaultAnchor, defaultAnchor);
  const mergedMetadata = {
    ...metadata,
    contour: phraseSegment?.contour ?? metadata.contour,
    intervalBias: phraseSegment?.intervalBias ?? metadata.intervalBias,
    peaksPerPhrase: phraseSegment?.peaksPerPhrase ?? metadata.peaksPerPhrase,
    anchorRange: phraseSegment?.anchorRange ?? metadata.anchorRange,
  };
  return {
    part,
    metadata: mergedMetadata,
    anchorMidi,
    lastMidi: anchorMidi,
    centerMidi: anchorMidi,
    globalShift: 0,
    noteIndex: 0,
    peaksUsed: 0,
  };
}

function average(values = []) {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function noteStringToMidiSafe(noteStr, fallbackNote = "C3") {
  const normalized = ensureNoteWithOctave(noteStr, fallbackNote);
  return noteStringToMidi(normalized);
}

function ensureNoteWithOctave(noteStr, fallbackNote = "C3") {
  const base = stripOctave(noteStr || fallbackNote || "C3") || "C";
  const octave = extractOctaveNumber(noteStr, extractOctaveNumber(fallbackNote, 3));
  return `${base}${octave}`;
}

function extractOctaveNumber(noteStr, defaultOctave = 3) {
  const match = noteStr && noteStr.match(/-?\d+/);
  return match ? Number(match[0]) : defaultOctave;
}


function computeDefaultHandAnchors({
  key,
  mode,
  styleId,
  motifStyle,
  leftHandPatternId,
  leftPatternMeta,
  styleAnchors,
}) {
  const rhCandidate = deriveRhAnchorCandidate({ key, motifStyle, styleAnchors });
  const rhAnchor = clampAnchorToRangeSpec(rhCandidate, styleAnchors?.rh, "rh");
  const rhMidi = noteStringToMidiSafe(rhAnchor, rhAnchor);
  const gap = computeStyleGap(styleId, leftHandPatternId);
  const lhCandidateMidi = rhMidi - gap;
  const lhCandidate = midiToNote(lhCandidateMidi, prefersFlatNotation(key));
  const lhAnchor = clampAnchorToRangeSpec(lhCandidate, styleAnchors?.lh, "lh");
  return { lh: lhAnchor, rh: rhAnchor };
}

function deriveRhAnchorCandidate({ key, motifStyle, styleAnchors }) {
  const targetRegister = motifStyle?.targetRegister || deriveRangeMidpointNote(styleAnchors?.rh, "C5");
  if (!targetRegister) return `${stripOctave(key || "C")}5`;
  return alignKeyToRegister(key, targetRegister);
}

function deriveRangeMidpointNote(range, fallback) {
  if (!range?.low || !range?.high) return fallback;
  const low = noteStringToMidiSafe(range.low, range.low);
  const high = noteStringToMidiSafe(range.high, range.high);
  const mid = Math.round((low + high) / 2);
  return midiToNote(mid);
}

function alignKeyToRegister(key, targetNote) {
  const keyBase = stripOctave(key || "C") || "C";
  const anchorReference = `${keyBase}4`;
  const referenceMidi = noteStringToMidiSafe(anchorReference, anchorReference);
  const targetMidi = noteStringToMidiSafe(targetNote || "C5", targetNote || "C5");
  const octaveAdjust = Math.round((targetMidi - referenceMidi) / 12);
  const octave = extractOctaveNumber(anchorReference, 4) + octaveAdjust;
  return `${keyBase}${octave}`;
}

function computeStyleGap(styleId, leftHandPatternId) {
  const base = STYLE_LH_ANCHOR_GAPS[styleId] ?? STYLE_LH_ANCHOR_GAPS.default;
  const adjust = PATTERN_LH_GAP_ADJUST[leftHandPatternId] || 0;
  return Math.max(8, base + adjust);
}

function estimateMotifRangeForAnchors({ motifStyle, key, mode, rhAnchor }) {
  if (!motifStyle || !motifStyle.degreePattern || !motifStyle.degreePattern.length) {
    return null;
  }
  const scale = generateScale({ key, mode });
  const stepsPerOctave = scale?.intervals?.length || 7;
  const anchorMidi = noteStringToMidiSafe(rhAnchor, rhAnchor);
  const baseNoteName = scale?.notes?.[0] || stripOctave(key || "C") || "C";
  const reference = `${baseNoteName}${extractOctaveNumber(rhAnchor, 5)}`;
  const referenceMidi = noteStringToMidiSafe(reference, reference);
  const octaveAdjust = Math.round((anchorMidi - referenceMidi) / 12);
  const startOctave = extractOctaveNumber(reference, 5) + octaveAdjust;
  const midis = motifStyle.degreePattern
    .map((degreeToken) => {
      const degreeNumber = resolveDegreeNumber(degreeToken);
      const noteName = degreeToNote(degreeToken, mode, scale);
      if (!noteName) return null;
      const octaveShift = Math.floor((degreeNumber - 1) / stepsPerOctave);
      const finalNote = `${noteName}${startOctave + octaveShift}`;
      return noteStringToMidiSafe(finalNote, finalNote);
    })
    .filter((midi) => Number.isFinite(midi));
  if (!midis.length) return null;
  return {
    min: Math.min(...midis),
    max: Math.max(...midis),
    avg: average(midis),
  };
}

function applyLowKeyGuard({ lhAnchor, motifRange, leftPatternMeta, styleAnchors, key }) {
  if (!motifRange || !lhAnchor) return lhAnchor;
  const patternHighOffset = leftPatternMeta?.highOffset ?? 12;
  const styleHigh = styleAnchors?.lh?.high ? noteStringToMidiSafe(styleAnchors.lh.high, styleAnchors.lh.high) : HAND_RANGE_MAP.lh.soft.max;
  const softHigh = Math.min(styleHigh, HAND_RANGE_MAP.lh.soft.max);
  let anchorMidi = noteStringToMidiSafe(lhAnchor, lhAnchor);
  const canRaiseOneOctave = () =>
    anchorMidi + 12 <= softHigh &&
    motifRange.min - (anchorMidi + 12 + patternHighOffset) >= MIN_LH_RH_INTERVAL;
  let iterations = 0;
  while (canRaiseOneOctave() && iterations < 4) {
    anchorMidi += 12;
    iterations += 1;
  }
  return midiToNote(anchorMidi, prefersFlatNotation(key));
}

function clampAnchorToRangeSpec(note, range, part = "lh") {
  if (!note) return note;
  const normalized = ensureNoteWithOctave(note, note);
  let midi = noteStringToMidiSafe(normalized, normalized);
  const fallback = HAND_RANGE_MAP[part]?.soft || HAND_RANGE_MAP.lh.soft;
  const min = range?.low ? noteStringToMidiSafe(range.low, range.low) : fallback.min;
  const max = range?.high ? noteStringToMidiSafe(range.high, range.high) : fallback.max;
  let guard = 0;
  while (midi < min && guard < 8) {
    midi += 12;
    guard += 1;
  }
  while (midi > max && guard < 16) {
    midi -= 12;
    guard += 1;
  }
  return midiToNote(midi);
}

function adjustAnchorForPattern(note, patternType) {
  if (!note) return note;
  const midi = noteStringToMidiSafe(note, note);
  const adjusted = adjustAnchorMidiForPattern(midi, patternType);
  return midiToNote(adjusted);
}

function adjustAnchorMidiForPattern(anchorMidi, patternType, part = "lh") {
  if (!Number.isFinite(anchorMidi)) return anchorMidi;
  const ranges = HAND_RANGE_MAP[part] || HAND_RANGE_MAP.lh;
  const soft = ranges.soft;
  let midi = anchorMidi;
  if (PATTERN_OCTAVE_REQUIREMENTS.has(patternType) && midi + 12 > soft.max) {
    midi -= 12;
  }
  while (midi < soft.min) {
    midi += 12;
  }
  while (midi > soft.max) {
    midi -= 12;
  }
  return midi;
}

function buildHandRangeMap(specs = {}) {
  return Object.fromEntries(
    Object.entries(specs).map(([part, definition]) => [part, createHandRangeSet(definition)])
  );
}

function createHandRangeSet({ comfort = {}, soft = {} } = {}) {
  const comfortLow = comfort.low || "C3";
  const comfortHigh = comfort.high || "C5";
  const softLow = soft.low || "A1";
  const softHigh = soft.high || "A6";
  return {
    comfort: {
      min: noteStringToMidiSafe(comfortLow, comfortLow),
      max: noteStringToMidiSafe(comfortHigh, comfortHigh),
    },
    soft: {
      min: noteStringToMidiSafe(softLow, softLow),
      max: noteStringToMidiSafe(softHigh, softHigh),
    },
  };
}


function computeDynamics(beatOffset, hints = {}) {
  const localBeat = ((beatOffset % 4) + 4) % 4;
  const fractional = localBeat - Math.floor(localBeat);
  const isDownbeat = localBeat < 1e-3;
  const isBackbeat = Math.abs(localBeat - 2) < 1e-3;
  const isOffbeat = Math.abs(fractional - 0.5) < 1e-3;
  const accents = hints.accents || {};
  const accent = isDownbeat ? accents.strong : isBackbeat ? accents.medium : accents.weak;
  const ghost = !isDownbeat && isOffbeat ? hints.ghost || 0 : 0;
  return { accent: accent || 0, ghost };
}

function computeSwingPosition(beatOffset, hints = {}) {
  const swingRange = hints.swingRange || {};
  const localBeat = ((beatOffset % 1) + 1) % 1;
  const isOffbeat = Math.abs(localBeat - 0.5) < 1e-3;
  return isOffbeat ? swingRange.offbeat || 0 : 0;
}

export function rhythmToDescription(rhythm) {
  const parts = rhythm.map((step) => durationToNotation(step.beats) + (step.rest ? " (rest)" : ""));
  const totalBeats = rhythm.reduce((sum, step) => sum + step.beats, 0);
  return `${parts.join(" | ")} (${totalBeats} beats)`;
}
