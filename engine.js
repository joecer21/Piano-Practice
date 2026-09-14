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
  degreeTokenSemitones,
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
 *   degree?: string;
 *   label?: string;
 *   rest?: boolean;
 * };
 */

const HAND_RANGE_MAP = buildHandRangeMap(HAND_RANGE_SPECS);

/*
 * Hand positions. A player picks where each hand lives once for the piece and
 * follows the chords by changing inversions, not octaves. The left hand gets two
 * lanes chosen once per assignment: a twelve-key bass lane, where every bass note
 * has exactly one home, and a chord lane above it that stops short of the tune.
 */

/** A1: no left-hand note goes below this, whatever the tune asks. */
export const KEYBOARD_FLOOR = 33;
/** The tune's lowest note sits at least this many semitones above the left hand's highest. */
export const HAND_CLEARANCE = 2;
/** E6: the highest a tune may be lifted to make room for the left hand. */
const MELODY_LIFT_CEILING = 88;
/** Semitones the lanes may drop to make room before the tune is lifted instead. */
const LANE_GIVE = 2;

/**
 * Lane shapes, in semitones from the bottom of the bass lane (`home`).
 * `chordFrom` is the lowest key a chord may use; `reach` is the top of the hand.
 */
const LANE_SHAPES = {
  // A low bass with chords, octaves or fifths above: bass E2–D#3, chords D3–D#4.
  bassAndChord: { home: 40, chordFrom: 10, reach: 23 },
  // One compact figure from the bass up: bass G2–F#3, chords C3–E4.
  compact: { home: 43, chordFrom: 5, reach: 21 },
  // Chords only: C3–E4.
  chords: { home: 45, chordFrom: 3, reach: 19 },
};

const laneOf = (patternId) => LEFT_HAND_PATTERN_METADATA[patternId]?.lane || "bassAndChord";

/** Figures played as one hand shape from the bass up, so the chord stays within this of the bass. */
const COMPACT_FIGURE_SPAN = 14;

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

/**
 * Where the tune should sit, before the left hand is placed under it. A preset
 * may name the tune's register (`anchors.rh`); otherwise the motif's own target
 * register, aligned to the key and kept within the style's right-hand range.
 */
export function createPhrasePlan({
  key = "C",
  styleId = "classical",
  motifPatternId = "pop-hook-1351",
  leftHandPatternId = "block",
  anchors: anchorOverrides = {},
} = {}) {
  const styleAnchors = getStyleAnchors(styleId) || {};
  const motifStyle = MOTIF_STYLES[motifPatternId] || MOTIF_STYLES["pop-hook-1351"];
  const rhAnchorNote = anchorOverrides?.rh
    ? ensureNoteWithOctave(anchorOverrides.rh, anchorOverrides.rh)
    : clampAnchorToRangeSpec(
        deriveRhAnchorCandidate({ key, motifStyle, styleAnchors }),
        styleAnchors.rh,
        "rh",
      );
  const lanes = planHandLanes({ leftHandPatternId, melody: null });

  return {
    key,
    styleId,
    motifPatternId,
    leftHandPatternId,
    lh: { anchorNote: midiToNote(lanes.home), anchorMidi: lanes.home },
    rh: {
      anchorNote: rhAnchorNote,
      anchorMidi: noteStringToMidiSafe(rhAnchorNote, rhAnchorNote),
      contour: motifStyle.contour || "arch",
      targetRegister: motifStyle.targetRegister || rhAnchorNote,
    },
    lanes,
  };
}

/**
 * Choose the left hand's lanes once for the whole assignment.
 *
 * With no tune, the lanes sit at the pattern's home. Under a tune, the hand stops
 * HAND_CLEARANCE below the tune's lowest note. When that leaves too little room,
 * one decision is made for the whole piece: drop the lanes a little, else lift the
 * tune an octave, else drop the lanes further (never below KEYBOARD_FLOOR). Chords
 * that still do not fit are thinned when they are voiced.
 *
 * @param {{ leftHandPatternId?: string, melody?: { min: number, max: number } | null }} options
 */
export function planHandLanes({ leftHandPatternId = "block", melody = null } = {}) {
  const shape = LANE_SHAPES[laneOf(leftHandPatternId)];
  const needed = shape.chordFrom + 9;
  let home = shape.home;
  let melodyShift = 0;
  let melodyMin = melody?.min ?? null;

  const shortfall = () => (melodyMin == null ? 0 : home + needed - (melodyMin - HAND_CLEARANCE));
  if (shortfall() > 0) {
    if (shortfall() <= Math.min(LANE_GIVE, home - KEYBOARD_FLOOR)) {
      home -= shortfall();
    } else {
      if (melody && melody.max + 12 <= MELODY_LIFT_CEILING) {
        melodyShift = 12;
        melodyMin += 12;
      }
      if (shortfall() > 0) home -= Math.min(shortfall(), home - KEYBOARD_FLOOR);
    }
  }

  const ceiling = Math.min(home + shape.reach, melodyMin == null ? Infinity : melodyMin - HAND_CLEARANCE);
  return {
    home,
    bassTop: Math.min(home + 11, ceiling),
    chordLow: home + shape.chordFrom,
    ceiling,
    reach: shape.reach,
    melodyShift,
  };
}

/**
 * Place both hands for an assignment: settle the tune's register, choose the left
 * hand's lanes under it, and lift the tune if that is the decision.
 */
export function placeHands({ motif, leftHandPatternId }) {
  const stats = motif ? gatherStepMidiStats(motif.steps) : null;
  const lanes = planHandLanes({
    leftHandPatternId,
    melody: stats ? { min: stats.min, max: stats.max } : null,
  });
  const placedMotif =
    motif && lanes.melodyShift
      ? { ...motif, steps: motif.steps.map((step) => transposeStep(step, lanes.melodyShift)) }
      : motif;
  return { motif: placedMotif, lanes };
}

export function generateMotif({ motifPatternId, styleId: playbackStyleId, phrasePlan }, scale) {
  if (motifPatternId === "none") return null;

  const patternId = motifPatternId || "pop-hook-1351";
  const style = MOTIF_STYLES[patternId] || MOTIF_STYLES["pop-hook-1351"];
  const playbackHints = getStylePlaybackHints(playbackStyleId || "classical", scale?.mode);
  const phraseSegment = phrasePlan?.rh || null;

  const rhythm = style.rhythm;
  const degreePattern = style.degreePattern;
  const degreeInterpretation = style.degreeInterpretation;

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
      const noteName = degreeToNote(degree, scale?.mode, scale, degreeInterpretation);
      const rootMidi = noteToMidi(motifRootNote, octaveBase);
      const expectedMidi = rootMidi + degreeTokenSemitones(degree, scale?.mode, degreeInterpretation);
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
  // The tune moves as one piece: its shape is never broken to fit a range.
  const placedSteps = keepStepsWithinRange(alignStepsToAnchor(steps, motifAnchorMidi, "rh"), "rh");

  const totalBeats = cumulative;
  const noteSteps = placedSteps.filter((s) => !s.rest);

  return {
    styleId: patternId,
    description: style.description,
    steps: placedSteps,
    // Pattern tokens as written. What they sound as depends on degreeInterpretation,
    // so display the pitches (Score degrees), not these.
    degrees: noteSteps.map((s) => s.degree),
    degreeInterpretation,
    rhythmLabels: steps.map((s) => s.label),
    noteLabels: noteSteps.map((s) => s.note.replace(/\d/g, "")),
    totalBeats,
  };
}

export function generateLeftHandPattern({ leftHand, difficulty, styleId, lanes }, progression, mode) {
  const difficultyLevel = difficulty || "intermediate";
  const playbackHints = getStylePlaybackHints(styleId, mode);
  const styleStrategy = getLeftHandStyleStrategy(styleId);
  const handLanes = fitBassLaneToProgression(
    lanes || planHandLanes({ leftHandPatternId: leftHand, melody: null }),
    progression,
  );
  let previousChord = null;
  // A chord that comes round again is found where the hand first played it.
  const remembered = new Map();

  const bars = progression.bars.map((bar, idx) => {
    const bass = placeBass(bar, handLanes);
    const voicing = chooseLaneVoicing(bar, {
      patternType: leftHand,
      styleId,
      styleStrategy,
      lanes: handLanes,
      previous: previousChord,
      remembered: remembered.get(bar.symbol) ?? null,
      bass: laneOf(leftHand) === "compact" ? bass : null,
    });
    previousChord = voicing.chord;
    if (!remembered.has(bar.symbol)) remembered.set(bar.symbol, voicing.chord);
    const built = buildPatternBar(bar, idx, leftHand, difficultyLevel, playbackHints, {
      bass,
      chord: voicing.chord,
      ceiling: handLanes.ceiling,
      voicingType: voicing.type,
    });
    return {
      ...built,
      voicing: {
        bass: leftHand === "block" ? [] : [midiToNote(bass)],
        chord: voicing.chord.map((midi) => midiToNote(midi)),
      },
    };
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

/** How far the bass lane may slide, once per assignment, to suit the progression. */
const BASS_LANE_SLIDE = { down: 4, up: 2 };

function rootPitchClass(bar) {
  const source = bar.bassNotes?.[0] || bar.chordNotes?.[0] || `${bar.root || "C"}3`;
  return ((noteStringToMidiSafe(source, "C3") % 12) + 12) % 12;
}

/** The bass note: the chord root's one position in the bass lane. */
function placeBass(bar, lanes) {
  let midi = lanes.home + ((rootPitchClass(bar) - (lanes.home % 12) + 12) % 12);
  while (midi > lanes.bassTop && midi - 12 >= KEYBOARD_FLOOR) midi -= 12;
  return midi;
}

/**
 * A twelve-key lane has one edge where a step in the harmony becomes a leap (a lane
 * from E splits D from E). Slide the lane a few keys, once for the whole piece, so
 * that edge falls where this progression moves least. Ties keep the lane at home.
 */
function fitBassLaneToProgression(lanes, progression) {
  const bars = progression?.bars || [];
  if (bars.length < 2) return lanes;
  let best = null;
  for (let slide = -BASS_LANE_SLIDE.down; slide <= BASS_LANE_SLIDE.up; slide++) {
    const home = lanes.home + slide;
    // The whole hand slides: sliding down lowers its top too, so it never spreads wider.
    const ceiling = Math.min(lanes.ceiling, home + lanes.reach);
    const bassTop = Math.min(home + 11, ceiling);
    if (home < KEYBOARD_FLOOR || bassTop - home < 11) continue;
    const candidate = { ...lanes, home, bassTop, ceiling, chordLow: lanes.chordLow + slide };
    const basses = bars.map((bar) => placeBass(bar, candidate));
    let travel = 0;
    for (let index = 0; index < basses.length; index++) {
      const next = basses[(index + 1) % basses.length];
      travel += Math.abs(next - basses[index]);
    }
    const cost = travel + Math.abs(slide) * 0.5;
    if (!best || cost < best.cost) best = { cost, lanes: candidate };
  }
  return best ? best.lanes : lanes;
}

/**
 * Voice the bar's chord inside the chord lane. Every allowed shape and inversion is
 * tried at every octave that fits wholly in the lane; the winner moves the fewest
 * semitones from the previous chord, returns to where this chord was played before,
 * stays near the middle of the lane, and follows the style's inversion preference.
 * A chord that cannot fit is re-inverted, then thinned, rather than leaving the lane.
 */
function chooseLaneVoicing(bar, { patternType, styleId, styleStrategy, lanes, previous, remembered, bass }) {
  const voicingType = chooseVoicingType(patternType, styleId, bar);
  const baseVoicing = getChordVoicing(bar, { type: voicingType });
  const rawNotes = baseVoicing.notes?.length ? baseVoicing.notes : bar.chordNotes || [];
  const baseMidis = rawNotes.map((note) => noteStringToMidiSafe(note, "C3"));
  const shapes = buildStyleVoicingCandidates({ bar, baseMidis, patternType, styleStrategy });
  // A compact figure keeps its chord just above its own bass; others use the chord lane.
  const compactLow = bass == null ? null : bass + 1;
  const compactHigh = bass == null ? null : Math.min(lanes.ceiling, bass + COMPACT_FIGURE_SPAN);
  const useCompact = compactLow != null && compactHigh - compactLow >= 7;
  const low = useCompact ? compactLow : Math.max(KEYBOARD_FLOOR, Math.min(lanes.chordLow, lanes.ceiling - 5));
  const high = useCompact ? compactHigh : lanes.ceiling;
  const target = low + (high - low) * 0.45;

  const fitted = (candidates) => {
    const placed = [];
    candidates.forEach((candidate, rank) => {
      for (let shift = -48; shift <= 48; shift += 12) {
        const midis = candidate.midis.map((midi) => midi + shift);
        if (midis[0] >= low && midis[midis.length - 1] <= high) placed.push({ ...candidate, midis, rank });
      }
    });
    return placed;
  };

  // Fallbacks, in order: the style's shapes; any inversion of the chord; the chord
  // without one note, then two. Over a sounding bass the root goes first, since the
  // bass already plays it; a chord on its own keeps its root.
  const inversions = rotations(baseMidis).map((midis) => ({ midis, shape: "inversion", inversion: null }));
  const dropOrder = bass != null || patternType !== "block" ? [1, 3, 2, 0] : [0, 1, 3, 2];
  const tiers = [
    shapes,
    inversions,
    [...shapes, ...inversions].map((shape) => thinShape(shape, baseMidis, shape.midis.length - 1, dropOrder)),
    [...shapes, ...inversions].map((shape) => thinShape(shape, baseMidis, 2, dropOrder)),
  ];
  let placed = [];
  for (let tier = 0; tier < tiers.length && !placed.length; tier++) {
    placed = fitted(tiers[tier].filter(Boolean)).map((candidate) => ({
      ...candidate,
      rank: candidate.rank + tier * 4,
    }));
  }
  if (!placed.length) {
    let root = baseMidis[0] ?? 48;
    while (root > high) root -= 12;
    while (root + 12 <= high && root < low) root += 12;
    placed = [{ midis: [root], shape: "single", inversion: null, rank: 0 }];
  }

  let best = null;
  for (const candidate of placed) {
    const center = average(candidate.midis);
    const cost =
      voiceMovement(previous, candidate.midis) +
      voiceMovement(remembered, candidate.midis) * 3 +
      Math.abs(center - target) * 0.35 +
      candidate.rank * 1.5 +
      (4 - Math.min(4, candidate.midis.length)) * 2;
    if (!best || cost < best.cost) best = { cost, candidate };
  }
  return { chord: best.candidate.midis, type: voicingType };
}

/** Total semitones the voices travel between two chords, each voice to its nearest. */
function voiceMovement(previous, next) {
  if (!previous?.length) return 0;
  const nearest = (midi, pool) => Math.min(...pool.map((other) => Math.abs(other - midi)));
  const forward = next.reduce((sum, midi) => sum + nearest(midi, previous), 0);
  const backward = previous.reduce((sum, midi) => sum + nearest(midi, next), 0);
  return (forward + backward) / 2;
}

/** Every inversion of a chord in close position. */
function rotations(baseMidis) {
  const chord = normalizeAscending(baseMidis);
  return chord.map((_, turn) =>
    normalizeAscending([...chord.slice(turn), ...chord.slice(0, turn).map((m) => m + 12)]),
  );
}

/** A smaller version of a shape: at most `size` notes, kept in `keepOrder` (indexes into the chord). */
function thinShape(shape, baseMidis, size, keepOrder) {
  if (size < 1 || shape.midis.length <= size) return null;
  const pitchClass = (midi) => ((midi % 12) + 12) % 12;
  const priority = keepOrder.map((index) => baseMidis[index]).filter((midi) => midi != null);
  const keep = new Set(priority.slice(0, size).map(pitchClass));
  const midis = shape.midis.filter((midi) => keep.has(pitchClass(midi)));
  return midis.length ? { ...shape, midis, shape: `${shape.shape}-thin` } : null;
}

function buildPatternBar(bar, barIndex, type, difficulty, playbackHints, placement) {
  const { bass, chord, ceiling, voicingType } = placement;
  const pattern = {
    title: `Bar ${barIndex + 1} (${bar.label})`,
    description: "",
  };
  const steps = [];
  const baseBeats = barIndex * 4;
  const note = (midi) => midiToNote(midi);
  const name = (midi) => stripOctave(midiToNote(midi));
  const chordNotes = chord.map(note);
  const chordLabel = chord.map(name).join("-");

  function scheduleBeat(beatOffset, payload) {
    const duration = payload.duration || "4n";
    steps.push({
      time: baseBeats + beatOffset,
      beats: payload.beats ?? toneToBeatsFromDuration(duration),
      duration,
      swingPosition: computeSwingPosition(beatOffset, playbackHints),
      dynamics: computeDynamics(beatOffset, playbackHints),
      ...payload,
    });
  }

  // Figures above the bass never pass the lane's ceiling: an octave becomes a fifth, a fifth the bass.
  const intervals = (bar.bassNotes || []).map((value, index, all) =>
    index === 0
      ? 0
      : (((noteStringToMidiSafe(value, "C3") - noteStringToMidiSafe(all[0], "C3")) % 12) + 12) % 12,
  );
  const fifthInterval = intervals[2] ?? 7;
  const thirdInterval = intervals[1] ?? 4;
  const seventhInterval = intervals[3] ?? 12;
  const within = (midi, fallback) => (midi <= ceiling ? midi : fallback);
  const fifth = within(bass + fifthInterval, bass);
  const octave = within(bass + 12, fifth);
  // Chord tones above the bass, without doubling the note the bass already plays.
  const above = chord.filter((midi) => midi > bass && (midi - bass) % 12 !== 0);
  const upper = above.length ? above : chord;
  const chordTop = upper[upper.length - 1];
  const chordMiddle = upper[upper.length - 2] ?? chordTop;

  if (type === "alberti") {
    const figure = [bass, chordTop, chordMiddle, chordTop];
    const subdivision = difficulty === "advanced" ? 0.25 : 0.5;
    const duration = subdivision === 0.25 ? "16n" : "8n";
    const totalSteps = Math.round(4 / subdivision);
    for (let i = 0; i < totalSteps; i++) {
      scheduleBeat(i * subdivision, { note: note(figure[i % figure.length]), duration });
    }
    pattern.description = `${bar.label}: ${figure.map(name).join(" - ")} (${voicingType}) in ${
      subdivision === 0.25 ? "sixteenths" : "eighths"
    }`;
  } else if (type === "broken") {
    // Bass, the chord tones above it, then the bass note again on top when it fits.
    let top = bass + 12;
    while (top <= chordTop) top += 12;
    const figure = upper.length < 3 ? [bass, ...upper, within(top, chordMiddle)] : [bass, ...upper];
    let beat = 0;
    while (beat < 4 - 1e-6) {
      for (const midi of figure) {
        if (beat >= 4 - 1e-6) break;
        scheduleBeat(beat, { note: note(midi), duration: "8n" });
        beat += 0.5;
      }
    }
    pattern.description = `${bar.label}: broken ${chordLabel} (${voicingType})`;
  } else if (type === "block") {
    scheduleBeat(0, { notes: chordNotes, duration: "1m" });
    pattern.description = `${bar.label}: block ${chordLabel} (full chord)`;
  } else if (type === "root-5th-oct") {
    [bass, fifth, octave, fifth].forEach((midi, i) => scheduleBeat(i, { note: note(midi), duration: "4n" }));
    pattern.description = `${bar.label}: root–5th–octave in quarters`;
  } else if (type === "pop-8ths") {
    for (let i = 0; i < 8; i++) {
      scheduleBeat(i * 0.5, { note: note(i % 2 === 0 ? bass : octave), duration: "8n" });
    }
    pattern.description = `${bar.label}: pop 8ths on root/octave (${name(bass)} / ${name(octave)})`;
  } else if (type === "power-8ths") {
    const dyad = fifth === bass ? [note(bass)] : [note(bass), note(fifth)];
    for (let i = 0; i < 8; i++) {
      scheduleBeat(i * 0.5, { notes: dyad, duration: "8n" });
    }
    pattern.description = `${bar.label}: power-fifths 8ths (${dyad.map(stripOctave).join("–")})`;
  } else if (type === "pedal") {
    scheduleBeat(0, { note: note(bass), duration: "2n" });
    scheduleBeat(2, { note: note(bass), duration: "2n" });
    scheduleBeat(1.5, { notes: chordNotes, duration: "8n" });
    scheduleBeat(3.5, { notes: chordNotes, duration: "8n" });
    pattern.description = `${bar.label}: pedal ${name(bass)} with off-beat chords (${chordLabel})`;
  } else if (type === "stride") {
    scheduleBeat(0, { note: note(bass), duration: "4n" });
    scheduleBeat(1.5, { notes: chordNotes, duration: "4n" });
    scheduleBeat(2, { note: note(bass), duration: "4n" });
    scheduleBeat(3.5, { notes: chordNotes, duration: "4n" });
    pattern.description = `${bar.label}: light stride bass ${name(bass)} + chords (${chordLabel})`;
  } else if (type === "walking") {
    const walk = [bass, within(bass + thirdInterval, bass), fifth, within(bass + seventhInterval, fifth)];
    walk.forEach((midi, b) => scheduleBeat(b, { note: note(midi), duration: "4n" }));
    pattern.description = `${bar.label}: walking bass through chord tones (${walk.map(name).join("-")})`;
  } else {
    scheduleBeat(0, { note: note(bass), duration: "4n" });
    for (let b = 1; b <= 3; b++) {
      scheduleBeat(b, { notes: chordNotes, duration: "4n" });
    }
    pattern.description = `${bar.label}: bass ${name(bass)} + chord ${chordLabel} (${voicingType})`;
  }

  return { ...pattern, steps };
}

function buildStyleVoicingCandidates({ bar, baseMidis, patternType, styleStrategy }) {
  const parsedRoman = bar?.symbol ? parseRomanSymbol(bar.symbol) : null;
  const allowedShapes = styleStrategy?.allowedShapes?.length ? styleStrategy.allowedShapes : ["triad"];
  const allowedInversions = resolveAllowedInversions({ patternType, styleStrategy, parsedRoman });
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (midis, meta = {}) => {
    if (!midis || !midis.length) return;
    const normalized = normalizeAscending(midis);
    const key = normalized.map((m) => ((m % 12) + 12) % 12).join("-") + `|${normalized[0] % 12}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ midis: normalized, shape: meta.shape || "triad", inversion: meta.inversion || null });
  };

  if (allowedShapes.includes("triad") && baseMidis.length) {
    allowedInversions.forEach((inv) => {
      pushCandidate(applyInversion(baseMidis, inv), { shape: "triad", inversion: inv });
    });
  }

  if (allowedShapes.includes("open5")) {
    pushCandidate(buildOpenFifthCandidate(baseMidis, styleStrategy?.includeSeventhInOpen), {
      shape: "open5",
    });
  }

  if (allowedShapes.includes("shell")) {
    pushCandidate(buildShellCandidate(baseMidis, styleStrategy?.shellOptions || {}), { shape: "shell" });
  }

  if (allowedShapes.includes("quartal")) {
    pushCandidate(buildQuartalCandidate(baseMidis[0]), { shape: "quartal" });
  }

  if (!candidates.length) {
    pushCandidate(baseMidis, { shape: "triad" });
  }

  return candidates;
}

function resolveAllowedInversions({ patternType, styleStrategy, parsedRoman }) {
  let allowed = styleStrategy?.allowedInversions || ["root"];
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

/** Close position from the root, then rotate the lowest notes up an octave. */
function applyInversion(sourceMidis = [], inversion = "root") {
  if (!sourceMidis.length) return null;
  const chord = normalizeAscending(sourceMidis);
  const inversionSteps = inversion === "first" ? 1 : inversion === "second" ? 2 : 0;
  for (let i = 0; i < Math.min(inversionSteps, chord.length - 1); i++) {
    chord.push(chord.shift() + 12);
  }
  return normalizeAscending(chord);
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

/** Move a whole part by octaves until it sits within its hand's soft range. */
function keepStepsWithinRange(steps = [], part = "rh") {
  const stats = gatherStepMidiStats(steps);
  const soft = HAND_RANGE_MAP[part]?.soft;
  if (!stats || !soft) return steps;
  let delta = 0;
  for (let guard = 0; guard < 4 && stats.max + delta > soft.max; guard++) delta -= 12;
  for (let guard = 0; guard < 4 && stats.min + delta < soft.min; guard++) delta += 12;
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

function buildHandRangeMap(specs = {}) {
  return Object.fromEntries(
    Object.entries(specs).map(([part, definition]) => [part, createHandRangeSet(definition)]),
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
