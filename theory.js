// theory.js
// Core music theory utilities and data catalogs.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const NOTE_TO_INDEX = (() => {
  const map = {};
  NOTE_NAMES.forEach((note, idx) => {
    map[note] = idx;
  });
  NOTE_NAMES_FLAT.forEach((note, idx) => {
    map[note] = idx;
  });
  return map;
})();

export const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 11];
const MELODIC_MINOR_STEPS = [0, 2, 3, 5, 7, 9, 11];
const PENTATONIC_MAJOR_STEPS = [0, 2, 4, 7, 9];
const PENTATONIC_MINOR_STEPS = [0, 3, 5, 7, 10];
const MAJOR_BLUES_STEPS = [0, 2, 3, 4, 7, 9];
const MINOR_BLUES_STEPS = [0, 3, 5, 6, 7, 10];

const MAJOR_TRIADS = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MINOR_TRIADS = ["min", "dim", "maj", "min", "min", "maj", "maj"];
const HARMONIC_MINOR_TRIADS = ["min", "dim", "aug", "min", "maj", "maj", "dim"];
const MELODIC_MINOR_TRIADS = ["min", "min", "aug", "maj", "maj", "dim", "dim"];

const MODE_DEFINITIONS = {
  major: { label: "Major", intervals: MAJOR_SCALE_STEPS, chordQualities: MAJOR_TRIADS },
  minor: { label: "Minor", intervals: NATURAL_MINOR_STEPS, chordQualities: MINOR_TRIADS },
  pentatonicMajor: {
    label: "Pentatonic Major",
    intervals: PENTATONIC_MAJOR_STEPS,
    chordQualities: MAJOR_TRIADS,
  },
  pentatonicMinor: {
    label: "Pentatonic Minor",
    intervals: PENTATONIC_MINOR_STEPS,
    chordQualities: MINOR_TRIADS,
  },
  harmonicMinor: {
    label: "Harmonic Minor",
    intervals: HARMONIC_MINOR_STEPS,
    chordQualities: HARMONIC_MINOR_TRIADS,
  },
  melodicMinor: {
    label: "Melodic Minor",
    intervals: MELODIC_MINOR_STEPS,
    chordQualities: MELODIC_MINOR_TRIADS,
  },
  majorBlues: {
    label: "Major Blues",
    intervals: MAJOR_BLUES_STEPS,
    chordQualities: MAJOR_TRIADS,
  },
  minorBlues: {
    label: "Minor Blues",
    intervals: MINOR_BLUES_STEPS,
    chordQualities: MINOR_TRIADS,
  },
};

export const SCALE_PATTERNS = Object.fromEntries(
  Object.entries(MODE_DEFINITIONS).map(([mode, def]) => [mode, { ...def }])
);

export const MODE_LABELS = Object.fromEntries(
  Object.entries(SCALE_PATTERNS).map(([mode, def]) => [mode, def.label])
);

export const MODE_CHORD_QUALITIES = Object.fromEntries(
  Object.entries(SCALE_PATTERNS).map(([mode, def]) => [mode, def.chordQualities])
);

const MODE_ALIASES = {
  naturalMinor: "minor",
  aeolian: "minor",
  pentMajor: "pentatonicMajor",
  pentMinor: "pentatonicMinor",
  blues: "minorBlues",
};

const MODE_HARMONIC_FALLBACK = {
  pentatonicMajor: "major",
  pentatonicMinor: "minor",
  majorBlues: "major",
  minorBlues: "minor",
};

function normalizeModeId(mode) {
  if (!mode) return "major";
  if (SCALE_PATTERNS[mode]) return mode;
  const alias = MODE_ALIASES[mode];
  if (alias && SCALE_PATTERNS[alias]) return alias;
  return "major";
}

function getModeDefinition(mode) {
  const normalized = normalizeModeId(mode);
  return SCALE_PATTERNS[normalized] || SCALE_PATTERNS.major;
}

function getModeIntervals(mode) {
  return getModeDefinition(mode).intervals;
}

function prefersFlatKeySignature(key, mode) {
  if (!key) return false;
  if (/b/.test(key)) return true;
  if (/#/.test(key)) return false;
  const bareKey = key.replace(/\d+/g, "");
  const normalizedMode = normalizeModeId(mode);
  const minorLikeModes = new Set(["minor", "harmonicMinor", "melodicMinor", "pentatonicMinor", "minorBlues"]);
  const majorFlatKeys = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);
  const minorFlatKeys = new Set(["D", "G", "C", "F", "Bb", "Eb", "Ab", "Db"]);
  const targetSet = minorLikeModes.has(normalizedMode) ? minorFlatKeys : majorFlatKeys;
  return targetSet.has(bareKey);
}

function getHarmonicIntervals(mode) {
  const normalized = normalizeModeId(mode);
  const intervals = getModeIntervals(normalized);
  if (intervals && intervals.length >= 7) {
    return intervals;
  }
  const fallbackMode = MODE_HARMONIC_FALLBACK[normalized];
  if (fallbackMode) {
    return getModeIntervals(fallbackMode);
  }
  return MAJOR_SCALE_STEPS;
}

export const ROMAN_TO_DEGREE = {
  I: 0,
  II: 1,
  III: 2,
  IV: 3,
  V: 4,
  VI: 5,
  VII: 6,
  i: 0,
  ii: 1,
  iii: 2,
  iv: 3,
  v: 4,
  vi: 5,
  vii: 6,
};

const DEGREE_TO_ROMAN = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
];

// One source of truth for duration. Every `beats` value the engine can emit must
// appear here; the three derived views below are generated from it rather than
// hand-maintained in parallel, which is how 3- and 4-beat notes silently became
// quarter notes. `beats` is canonical - Tone notation is a rendering of it.
export const DURATION_TABLE = Object.freeze([
  { beats: 0.25, tone: "16n", label: "sixteenth" },
  { beats: 0.5, tone: "8n", label: "eighth" },
  { beats: 0.75, tone: "8n.", label: "dotted-eighth" },
  { beats: 1, tone: "4n", label: "quarter" },
  { beats: 1.5, tone: "4n.", label: "dotted-quarter" },
  { beats: 2, tone: "2n", label: "half" },
  { beats: 3, tone: "2n.", label: "dotted-half" },
  { beats: 4, tone: "1m", label: "whole" },
]);

export const DURATION_LABELS = Object.freeze(
  Object.fromEntries(DURATION_TABLE.map((entry) => [entry.beats, entry.label])),
);

const TONE_BY_BEATS = new Map(DURATION_TABLE.map((entry) => [entry.beats, entry.tone]));
const BEATS_BY_TONE = new Map([
  ...DURATION_TABLE.map((entry) => [entry.tone, entry.beats]),
  ["1n", 4], // common alias for a whole note
]);

export const DEGREE_POOLS = {
  simple: [1, 2, 3, 5],
  moderate: [1, 2, 3, 4, 5, 6],
  complex: [1, 2, 3, 4, 5, 6, 7],
};

export const PROGRESSION_PRESETS = [
  // POP / ROCK
  {
    id: "pop-4",
    label: "Pop 4",
    description: "Modern pop staple (I–V–vi–IV) with chord qualities re-shaped to your selected mode.",
    roman: ["I", "V", "vi", "IV"],
  },
  {
    id: "doo-wop",
    label: "Doo-wop",
    description: "50s doo-wop cadence with a mellow vi.",
    roman: ["I", "vi", "IV", "V"],
  },
  {
    id: "pop-backwards",
    label: "Pop Backwards",
    description: "Emo / pop-punk style loop starting on vi.",
    roman: ["vi", "IV", "I", "V"],
  },
  {
    id: "pop-lift",
    label: "Four-Chord Lift",
    description: "Driving progression with strong motion back to I.",
    roman: ["I", "V", "IV", "V"],
  },
  {
    id: "pent-bootcamp",
    label: "Pentatonic Bootcamp",
    description: "Simple i–IV–V–i loop tailored for pentatonic practice.",
    roman: ["i", "IV", "V", "i"],
  },
  {
    id: "rock-minor",
    label: "Rock Minor",
    description: "Classic natural-minor rock progression.",
    roman: ["i", "bVII", "bVI", "bVII"],
  },

  // FUNCTIONAL / CLASSICAL
  {
    id: "pachelbel",
    label: "Pachelbel",
    description: "Canon-style loop with a long arc.",
    roman: ["I", "V", "vi", "III", "IV", "I", "IV", "V"],
  },
  {
    id: "basic-cadence",
    label: "Basic Cadence",
    description: "Simple tonic-subdominant-dominant-tonic cadence.",
    roman: ["I", "IV", "V", "I"],
  },
  {
    id: "harmonic-cadence",
    label: "Dramatic Harmonic Cadence",
    description: "i–iv–V–i turn for harmonic minor drama.",
    roman: ["i", "iv", "V", "i"],
  },
  {
    id: "deceptive-cadence",
    label: "Deceptive Cadence",
    description: "Standard deceptive move from V to vi.",
    roman: ["I", "IV", "V", "vi"],
  },
  {
    id: "predom-cadence",
    label: "Pre-dominant Cadence",
    description: "ii-V-I with an extra bar of tonic.",
    roman: ["ii", "V", "I", "I"],
  },
  {
    id: "circle",
    label: "Circle of Fifths",
    description: "Eight-bar circle movement returning home.",
    roman: ["I", "IV", "viio", "iii", "vi", "ii", "V", "I"],
  },

  // JAZZ / TURNAROUNDS
  {
    id: "jazz-251",
    label: "Jazz Turnaround",
    description: "Classic ii-V-I resolution.",
    roman: ["ii7", "V7", "Imaj7", "Imaj7"],
  },
  {
    id: "jazz-extended",
    label: "Jazz Extended Turnaround",
    description: "ii-V-I with a VI7 to keep the harmony moving.",
    roman: ["ii7", "V7", "Imaj7", "VI7"],
  },
  {
    id: "jazz-minor-251",
    label: "Minor ii-V-I",
    description: "iio7-V7-i7 style minor resolution.",
    roman: ["iio7", "V7", "i7"],
  },
  {
    id: "jazz-backdoor",
    label: "Backdoor Resolution",
    description: "iv7-bVII7-Imaj7 backdoor cadence.",
    roman: ["iv7", "bVII7", "Imaj7"],
  },

  // BLUES / MODAL / AMBIENT
  {
    id: "blues-12",
    label: "12-Bar Blues",
    description: "Straight-ahead 12-bar blues form.",
    roman: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
  },
  {
    id: "blues-12-minor",
    label: "12-Bar Minor Blues",
    description: "Classic i–iv–V minor blues form.",
    roman: ["i7", "i7", "i7", "i7", "iv7", "iv7", "i7", "i7", "V7", "iv7", "i7", "V7"],
  },
  {
    id: "lofi-loop",
    label: "Lo-Fi Minor Loop",
    description: "Moody i–VI–III–VII loop for producer practice.",
    roman: ["i", "VI", "III", "VII"],
  },
  {
    id: "dorian-vamp",
    label: "Minor Vamp (Raised 6)",
    description: "Minor tonic with a bright IV lifted by a raised 6th color.",
    roman: ["i", "IV", "i", "IV"],
  },
  {
    id: "modal-vamp",
    label: "Modal Vamp (i–VII)",
    description: "Two-chord modal bed cycling i–VII.",
    roman: ["i", "bVII", "i", "bVII"],
  },
  {
    id: "modal-lament",
    label: "Modal Lament",
    description: "Haunting i–♭VII–iv–i motion for moody textures.",
    roman: ["i", "bVII", "iv", "i"],
  },
  {
    id: "neo-disco",
    label: "Neo-Disco Loop",
    description: "Minor tonic cycling through VII–III–IV for tight funk progressions.",
    roman: ["i", "VII", "III", "IV"],
  },
  {
    id: "lydian-float",
    label: "Major Float (Raised 4)",
    description: "Shimmering major motion featuring the raised fourth (major II).",
    roman: ["I", "II", "I", "II"],
  },
];

export const STYLE_PALETTE_SETS = {
  classical: [
    { label: "Primary", chords: ["I", "IV", "V"] },
    { label: "Secondary", chords: ["ii", "iii", "vi", "viio"] },
    { label: "Borrowed", chords: ["iv", "bVII"] },
    { label: "Secondary Dominants", chords: ["V/V", "V/ii"] },
  ],
  pop: [
    { label: "Primary", chords: ["I", "V", "vi", "IV"] },
    { label: "Colors", chords: ["bVII", "bIII", "bVI"] },
    { label: "Lift / Drive", chords: ["ii", "V/V"] },
  ],
  jazz: [
    { label: "Cadence", chords: ["ii", "V", "I"] },
    { label: "Subs / Colors", chords: ["iii", "vi", "bIII", "bVII"] },
    { label: "Dominants", chords: ["V/V", "V/ii", "bII"] },
    { label: "Leading Tone", chords: ["viio", "iio"] },
  ],
  modal: [
    { label: "Centers", chords: ["I", "bVII", "bVI"] },
    { label: "Drones", chords: ["I", "v", "iv"] },
    { label: "Colors", chords: ["bII", "bIII", "bVI", "bVII"] },
  ],
};

function isDominantRoman(roman, opts = {}) {
  if (opts.isSecondary) return true;
  if (!roman) return false;
  const parsed = parseRomanSymbol(roman);
  const numeral = (parsed?.numeral || roman || "").toUpperCase();
  return numeral === "V";
}

export const STYLE_PROFILES = {
  classical: {
    id: "classical",
    label: "Classical",
    description: "Triads with functional dominants and leading-tone chords.",
    humanize: { timing: 0.008, velocity: 0.05, swing: 0 },
    getChordTag: (roman, baseQuality, opts = {}) => {
      if (opts.isSecondary) return "dom7";
      if (/^vii/i.test(roman)) return "dim";
      return baseQuality === "minor" ? "min" : baseQuality === "diminished" ? "dim" : "maj";
    },
  },
  pop: {
    id: "pop",
    label: "Pop / Rock",
    description: "Triads with optional dominant 7s and borrowed colors.",
    humanize: { timing: 0.012, velocity: 0.08, swing: 0.05 },
    getChordTag: (roman, baseQuality, opts = {}) => {
      if (opts.isSecondary) return "dom7";
      return baseQuality === "minor" ? "min" : baseQuality === "diminished" ? "dim" : "maj";
    },
  },
  jazz: {
    id: "jazz",
    label: "Jazz",
    description: "Seventh chords by default (ii7-V7-Imaj7).",
    humanize: { timing: 0.02, velocity: 0.12, swing: 0.12 },
    getChordTag: (roman, baseQuality, opts = {}) => {
      if (isDominantRoman(roman, opts)) return "dom7";
      const upper = roman.toUpperCase();
      if (upper === "I" || upper === "IV" || upper === "BIII") return "maj7";
      if (upper === "VII") return "hdim7";
      if (baseQuality === "diminished") return "hdim7";
      return "min7";
    },
  },
  modal: {
    id: "modal",
    label: "Modal / Ambient",
    description: "Stable triads with gentle color tones.",
    humanize: { timing: 0.015, velocity: 0.07, swing: 0.08 },
    getChordTag: (roman, baseQuality, opts = {}) => {
      if (opts.isSecondary) return "dom7";
      return baseQuality === "minor" ? "min" : baseQuality === "diminished" ? "dim" : "maj";
    },
  },
};

export function getStyleProfile(styleId) {
  return STYLE_PROFILES[styleId] || STYLE_PROFILES.classical;
}

export const STYLE_PLAYBACK_HINTS = {
  classical: {
    swingRange: { offbeat: 0, triplet: 0 },
    humanizeRange: { timing: [0.004, 0.012], velocity: [0.04, 0.08] },
    accents: { strong: 0.15, medium: 0.08, weak: 0.04 },
    ghost: 0.25,
  },
  pop: {
    swingRange: { offbeat: 0.15, triplet: 0.05 },
    humanizeRange: { timing: [0.006, 0.016], velocity: [0.05, 0.1] },
    accents: { strong: 0.18, medium: 0.1, weak: 0.05 },
    ghost: 0.3,
  },
  jazz: {
    swingRange: { offbeat: 0.35, triplet: 0.25 },
    humanizeRange: { timing: [0.01, 0.024], velocity: [0.08, 0.14] },
    accents: { strong: 0.25, medium: 0.16, weak: 0.08 },
    ghost: 0.4,
  },
  modal: {
    swingRange: { offbeat: 0.2, triplet: 0.1 },
    humanizeRange: { timing: [0.008, 0.02], velocity: [0.06, 0.12] },
    accents: { strong: 0.2, medium: 0.12, weak: 0.06 },
    ghost: 0.35,
  },
};

export function getStylePlaybackHints(styleId, mode = "major") {
  const base = STYLE_PLAYBACK_HINTS[styleId] || STYLE_PLAYBACK_HINTS.classical;
  const hints = { ...base, accents: { ...base.accents } };
  if (mode === "majorBlues" || mode === "minorBlues") {
    hints.swingRange = {
      ...base.swingRange,
      offbeat: Math.min(0.4, (base.swingRange?.offbeat || 0) + 0.1),
    };
    hints.accents = {
      ...hints.accents,
      medium: (hints.accents.medium || 0.1) + 0.02,
    };
  }
  return hints;
}

export function getProgressionPreset(id) {
  if (!id) return null;
  if (id === "custom") return { id: "custom", label: "Custom", description: "Build your own", roman: [] };
  return PROGRESSION_PRESETS.find((p) => p.id === id) || null;
}

const RAW_MOTIF_STYLES = {
  "pop-hook-1351": {
    label: "Pop Hook - 1 3 5 1",
    description: "Straight quarter-note hook repeating 1-3-5-1 over two bars.",
    category: "pop",
    difficulty: "easy",
    bars: 2,
    rhythm: [
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
    ],
    degreePattern: [1, 3, 5, 1, 1, 3, 5, 1],
  },
  "pop-offbeat-echo": {
    label: "Pop - Offbeat Echo",
    description: "1-bar pop line with offbeat accents around the root and sixth.",
    category: "pop",
    difficulty: "easy",
    bars: 1,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: true },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: true },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
    ],
    degreePattern: [1, 1, 6, 5, 3, 2, 1, 1],
  },
  "arpeggio-climb": {
    label: "Pop Arpeggio - 1 3 5 8",
    description: "1-bar arpeggio hook climbing to the upper tonic and back.",
    category: "pop",
    difficulty: "intermediate",
    bars: 1,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
    ],
    degreePattern: [1, 3, 5, 8, 5, 3, 1, 1],
  },
  "ballad-long": {
    label: "Ballad - Long tones (3-1-5-1)",
    description: "Slow, lyrical phrase on degrees 3-1-5-1 in half notes.",
    category: "ballad",
    difficulty: "easy",
    bars: 2,
    rhythm: [
      { beats: 2, rest: false },
      { beats: 2, rest: false },
      { beats: 2, rest: false },
      { beats: 2, rest: false },
    ],
    degreePattern: [3, 1, 5, 1],
  },
  "ballad-call-response": {
    label: "Ballad - Call & Response",
    description: "Two-bar call-and-response line between tonic and third/fifth.",
    category: "ballad",
    difficulty: "easy",
    bars: 2,
    rhythm: [
      { beats: 2, rest: false },
      { beats: 2, rest: false },
      { beats: 2, rest: false },
      { beats: 2, rest: false },
    ],
    degreePattern: [1, 3, 5, 3],
  },
  "step-arch": {
    label: "Stepwise Arch - gentle climb and fall",
    description: "Stepwise arching melody: up then down over two bars.",
    category: "scalar",
    difficulty: "intermediate",
    bars: 2,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 1, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 1, rest: false },
      { beats: 2, rest: false },
      { beats: 2, rest: false },
    ],
    degreePattern: [1, 2, 3, 10, 3, 2, 1, 1],
    peaksPerPhrase: 1,
  },
  "scalar-run-8ths": {
    label: "Scalar Run - Ascending 8ths",
    description: "1-bar ascending scale run in even 8th-notes.",
    category: "scalar",
    difficulty: "intermediate",
    bars: 1,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
    ],
    degreePattern: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  "funk-sync": {
    label: "Funk Syncopation - root groove with rests",
    description: "Syncopated motif with off-beat rests around the root and fifth.",
    category: "groove",
    difficulty: "intermediate",
    bars: 2,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: true },
      { beats: 0.5, rest: false },
      { beats: 1.5, rest: false },
      { beats: 0.5, rest: true },
      { beats: 0.5, rest: false },
      { beats: 1, rest: false },
      { beats: 3, rest: false },
    ],
    degreePattern: [1, 1, 5, 1, 4, 5, 7, 1],
  },
  "funk-stabs": {
    label: "Funk Stabs - Short hits",
    description: "Short, punchy stabs around the root and flat 7 feel.",
    category: "groove",
    difficulty: "advanced",
    bars: 1,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: true },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: true },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: true },
    ],
    degreePattern: [1, 5, 7, 5, 4, 5, 1, 1],
  },
  "blues-riff": {
    label: "Blues Riff - Question",
    description: "Classic 1-bar blues-style riff that loops over the bar.",
    category: "blues",
    difficulty: "intermediate",
    bars: 1,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 1, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 1, rest: false },
    ],
    degreePattern: [1, 1, 3, 4, 4, 1],
  },
  "modal-pedal": {
    label: "Modal Pedal - Tonic + Color",
    description: "Two-bar modal feel: long tonic pedal with upper color tones.",
    category: "modal",
    difficulty: "easy",
    bars: 2,
    rhythm: [
      { beats: 4, rest: false },
      { beats: 2, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
    ],
    degreePattern: [1, 1, 4, 1],
  },
  "lofi-sway": {
    label: "Lo-Fi Sway - 1 5 6 5",
    description: "Laid-back syncopated riff cycling 1-5-6-5 with off-beat hits.",
    category: "lofi",
    difficulty: "easy",
    bars: 2,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: true },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 1, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 2, rest: false },
    ],
    degreePattern: [1, 1, 5, 6, 5, 1, 6, 5],
  },
  "swing-lick-3579": {
    label: "Swing Lick - 3 5 7 9",
    description: "Bebop-inspired 8th-note line outlining 3-5-7-9.",
    category: "jazz",
    difficulty: "intermediate",
    bars: 1,
    rhythm: [
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
    ],
    degreePattern: [3, 5, 7, 9, 5, 3, 2, 1],
  },
  "harmonic-rise": {
    label: "Harmonic Rise - 1 2 b3 #7",
    description: "Triplet-driven climb highlighting the raised 7 of harmonic minor.",
    category: "dramatic",
    difficulty: "intermediate",
    bars: 2,
    rhythm: [
      { beats: 1.5, rest: false },
      { beats: 1.5, rest: false },
      { beats: 1, rest: false },
      { beats: 0.5, rest: false },
      { beats: 0.5, rest: false },
      { beats: 2, rest: false },
    ],
    degreePattern: [1, 2, 3, 7, 1, 7],
  },
  "pent-grid": {
    label: "Pentatonic Grid - 1 b3 4 5",
    description: "Quarter-note pentatonic drill cycling 1-♭3-4-5.",
    category: "practice",
    difficulty: "easy",
    bars: 1,
    rhythm: [
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
      { beats: 1, rest: false },
    ],
    degreePattern: [1, "b3", 4, 5],
  },
};

const MOTIF_CATEGORY_DEFAULTS = {
  pop: { contour: "up", targetRegister: "C4", intervalBias: "steps", peaksPerPhrase: 1 },
  ballad: { contour: "arch", targetRegister: "B4", intervalBias: "steps", peaksPerPhrase: 1 },
  scalar: { contour: "arch", targetRegister: "C5", intervalBias: "steps", peaksPerPhrase: 2 },
  groove: { contour: "static", targetRegister: "A4", intervalBias: "thirds", peaksPerPhrase: 1 },
  blues: { contour: "down", targetRegister: "Bb4", intervalBias: "thirds", peaksPerPhrase: 1 },
  modal: { contour: "static", targetRegister: "G4", intervalBias: "steps", peaksPerPhrase: 1 },
  lofi: { contour: "down", targetRegister: "A4", intervalBias: "steps", peaksPerPhrase: 1 },
  jazz: { contour: "up", targetRegister: "D5", intervalBias: "thirds", peaksPerPhrase: 2 },
  dramatic: { contour: "up", targetRegister: "E5", intervalBias: "steps", peaksPerPhrase: 2 },
  practice: { contour: "static", targetRegister: "C5", intervalBias: "steps", peaksPerPhrase: 1 },
};

const MOTIF_DEFAULT_METADATA = {
  contour: "arch",
  targetRegister: "C5",
  intervalBias: "steps",
  peaksPerPhrase: 1,
};

function withMotifMetadata(base) {
  return Object.fromEntries(
    Object.entries(base).map(([id, motif]) => {
      const categoryDefaults = MOTIF_CATEGORY_DEFAULTS[motif.category] || {};
      const enriched = {
        ...MOTIF_DEFAULT_METADATA,
        ...categoryDefaults,
        ...motif,
      };
      enriched.contour = motif.contour || categoryDefaults.contour || MOTIF_DEFAULT_METADATA.contour;
      enriched.targetRegister = motif.targetRegister || categoryDefaults.targetRegister || MOTIF_DEFAULT_METADATA.targetRegister;
      enriched.intervalBias = motif.intervalBias || categoryDefaults.intervalBias || MOTIF_DEFAULT_METADATA.intervalBias;
      enriched.peaksPerPhrase = motif.peaksPerPhrase || categoryDefaults.peaksPerPhrase || MOTIF_DEFAULT_METADATA.peaksPerPhrase;
      return [id, enriched];
    })
  );
}

export const MOTIF_STYLES = withMotifMetadata(RAW_MOTIF_STYLES);

export const HAND_RANGE_SPECS = {
  lh: {
    comfort: { low: "C2", high: "G4" },
    soft: { low: "A1", high: "C5" },
  },
  rh: {
    comfort: { low: "G3", high: "E6" },
    soft: { low: "E3", high: "A6" },
  },
};

export const STYLE_HAND_ANCHORS = {
  classical: {
    lh: { low: "C2", high: "C4" },
    rh: { low: "C4", high: "E5" },
  },
  pop: {
    lh: { low: "C2", high: "G3" },
    rh: { low: "C4", high: "C5" },
  },
  jazz: {
    lh: { low: "A2", high: "G4" },
    rh: { low: "C4", high: "G5" },
  },
  modal: {
    lh: { low: "B1", high: "G3" },
    rh: { low: "B3", high: "F5" },
  },
  blues: {
    lh: { low: "A1", high: "G3" },
    rh: { low: "E4", high: "A5" },
  },
};

export function getStyleAnchors(styleId) {
  return STYLE_HAND_ANCHORS[styleId] || STYLE_HAND_ANCHORS.classical;
}

const RAW_LEFT_HAND_PATTERN_METADATA = {
  block: { defaultAnchor: "C3", maxSpan: 12, motionBias: "close", shape: "close", maxJump: 7, chordOffset: 0, allowedInversions: ["root"], allowedShapes: ["triad"], lockRegister: true },
  alberti: { defaultAnchor: "C3", maxSpan: 12, motionBias: "stepwise", shape: "broken", maxJump: 5, chordOffset: 10, highOffset: 7, allowedInversions: ["root"], allowedShapes: ["triad"], lockRegister: true },
  broken: { defaultAnchor: "C3", maxSpan: 14, motionBias: "arpeggio", shape: "arpeggio", maxJump: 9, chordOffset: 0, allowedShapes: ["triad"], lockRegister: true },
  oompah: { defaultAnchor: "C2", maxSpan: 12, motionBias: "leap-on-barlines", shape: "bass-chord", maxJump: 12, chordOffset: 0, allowedInversions: ["root"], allowedShapes: ["triad"], lockRegister: true },
  "root-5th-oct": { defaultAnchor: "C2", maxSpan: 14, motionBias: "leap-on-barlines", shape: "fixed", maxJump: 14, highOffset: 12, allowedShapes: ["open5"], lockRegister: true },
  "pop-8ths": { defaultAnchor: "C2", maxSpan: 12, motionBias: "steady", shape: "fixed", maxJump: 6, highOffset: 12, chordOffset: 0, allowedShapes: ["triad", "open5"], allowedInversions: ["root", "first"], lockRegister: true },
  "power-8ths": { defaultAnchor: "C2", maxSpan: 14, motionBias: "steady", shape: "dyad", maxJump: 8, highOffset: 7, allowedShapes: ["open5"], lockRegister: true },
  pedal: { defaultAnchor: "C2", maxSpan: 12, motionBias: "static", shape: "pedal", maxJump: 4, chordOffset: 0, allowedInversions: ["root"], allowedShapes: ["triad", "open5"], lockRegister: true },
  stride: { defaultAnchor: "C2", maxSpan: 16, motionBias: "leap-on-barlines", shape: "stride", maxJump: 16, chordOffset: 0, allowedShapes: ["triad"], lockRegister: true },
  walking: { defaultAnchor: "C2", maxSpan: 24, motionBias: "stepwise", shape: "scalar", maxJump: 6, highOffset: 5, allowedShapes: ["triad", "shell"] },
};

const LEFT_HAND_DEFAULT_METADATA = {
  defaultAnchor: "C3",
  maxSpan: 12,
  motionBias: "close",
  shape: "close",
  maxJump: 7,
  bassOffset: 0,
  highOffset: 12,
  chordOffset: 12,
  allowedInversions: null,
  allowedShapes: null,
  preferredRegister: null,
  anchorRange: null,
  lockRegister: false,
};

function withLeftHandDefaults(base) {
  return Object.fromEntries(
    Object.entries(base).map(([id, meta]) => [
      id,
      {
        ...LEFT_HAND_DEFAULT_METADATA,
        ...meta,
      },
    ])
  );
}

export const LEFT_HAND_PATTERN_METADATA = withLeftHandDefaults(RAW_LEFT_HAND_PATTERN_METADATA);

const STYLE_STRATEGY_DEFAULTS = {
  preferredRegister: { low: "B2", high: "E4" },
  allowedInversions: ["root"],
  allowedShapes: ["triad"],
  anchorRange: { low: "C2", high: "C4" },
};

export const LEFT_HAND_STYLE_STRATEGIES = {
  classical: {
    id: "classical",
    preferredRegister: { low: "B2", high: "F4" },
    allowedInversions: ["root", "first"],
    allowedShapes: ["triad"],
    anchorRange: { low: "C2", high: "C4" },
    lockRootPatterns: ["block", "pedal", "oompah", "alberti"],
    defaultInversionByRoman: { VII: "first", vii: "first" },
    forceFirstInversionOnDiminished: true,
  },
  pop: {
    id: "pop",
    preferredRegister: { low: "E2", high: "C4" },
    allowedInversions: ["root", "first", "second"],
    allowedShapes: ["triad"],
    anchorRange: { low: "C2", high: "G3" },
    lockRootPatterns: ["block", "pedal", "pop-8ths", "power-8ths", "root-5th-oct"],
    defaultInversionByRoman: {
      I: "root",
      V: "first",
      IV: "first",
      vi: "root",
      ii: "first",
    },
  },
  jazz: {
    id: "jazz",
    preferredRegister: { low: "A2", high: "F3" },
    allowedInversions: ["root", "first"],
    allowedShapes: ["shell", "triad"],
    anchorRange: { low: "A2", high: "G4" },
    lockRootPatterns: ["block"],
    shellOptions: { addThirteen: true },
  },
  blues: {
    id: "blues",
    preferredRegister: { low: "A1", high: "E3" },
    allowedInversions: ["root", "first"],
    allowedShapes: ["open5", "triad"],
    anchorRange: { low: "A1", high: "G3" },
    lockRootPatterns: ["root-5th-oct", "pop-8ths", "power-8ths", "block"],
  },
  modal: {
    id: "modal",
    preferredRegister: { low: "B2", high: "D4" },
    allowedInversions: ["root", "first"],
    allowedShapes: ["triad", "open5", "quartal"],
    anchorRange: { low: "B1", high: "G3" },
    lockRootPatterns: ["block", "pedal", "pop-8ths", "root-5th-oct"],
  },
};

export function getLeftHandStyleStrategy(styleId = "classical") {
  const strategy = LEFT_HAND_STYLE_STRATEGIES[styleId] || LEFT_HAND_STYLE_STRATEGIES.classical;
  if (!strategy) return STYLE_STRATEGY_DEFAULTS;
  return {
    ...STYLE_STRATEGY_DEFAULTS,
    ...strategy,
    preferredRegister: strategy.preferredRegister || STYLE_STRATEGY_DEFAULTS.preferredRegister,
    allowedInversions: strategy.allowedInversions || STYLE_STRATEGY_DEFAULTS.allowedInversions,
    allowedShapes: strategy.allowedShapes || STYLE_STRATEGY_DEFAULTS.allowedShapes,
    anchorRange: strategy.anchorRange || STYLE_STRATEGY_DEFAULTS.anchorRange,
  };
}

export function noteToMidi(note, octave) {
  return NOTE_TO_INDEX[note] + 12 * (octave + 1);
}

export function midiToNote(midi, preferFlat = false) {
  const collection = preferFlat ? NOTE_NAMES_FLAT : NOTE_NAMES;
  const idx = ((midi % 12) + 12) % 12;
  const note = collection[idx];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function noteNameFromIndex(idx, preferFlat = false) {
  return preferFlat ? NOTE_NAMES_FLAT[idx % 12] : NOTE_NAMES[idx % 12];
}

function parseDegreeToken(token) {
  if (typeof token === "number" && Number.isFinite(token)) {
    return { degree: token, accidental: 0 };
  }

  const raw = String(token ?? "1").trim();
  if (!raw.length) return { degree: 1, accidental: 0 };

  let accidental = 0;
  let idx = 0;
  while (idx < raw.length) {
    const ch = raw[idx];
    if (ch === "b" || ch === "\u266d") {
      accidental -= 1;
      idx += 1;
    } else if (ch === "#" || ch === "\u266f") {
      accidental += 1;
      idx += 1;
    } else {
      break;
    }
  }

  const numeric = parseInt(raw.slice(idx), 10);
  const degree = Number.isFinite(numeric) ? numeric : 1;
  return { degree, accidental };
}

export function degreeToNote(degreeInput, mode, scale = {}) {
  const parsed = parseDegreeToken(degreeInput);
  const normalizedMode = normalizeModeId(mode || scale.mode);
  const intervals = getModeIntervals(normalizedMode);
  const span = intervals.length || 7;
  const degreeIndex = ((parsed.degree - 1) % span + span) % span;
  const octaveOffset = Math.floor((parsed.degree - 1) / span);
  const semitoneOffset = intervals[degreeIndex] + parsed.accidental + octaveOffset * 12;
  const root = scale.key || scale.root || scale.notes?.[0] || "C";
  const rootIndex = NOTE_TO_INDEX[root] ?? NOTE_TO_INDEX.C;
  const absoluteIndex = (rootIndex + semitoneOffset + 1200) % 12;
  const preferFlat = parsed.accidental < 0 || /b|\u266d/.test(root);
  return noteNameFromIndex(absoluteIndex, preferFlat);
}

export function chordTagToIntervals(tag) {
  switch (tag) {
    case "maj7": return [0, 4, 7, 11];
    case "min7": return [0, 3, 7, 10];
    case "dom7": return [0, 4, 7, 10];
    case "hdim7": return [0, 3, 6, 10];
    case "dim": return [0, 3, 6];
    case "min": return [0, 3, 7];
    case "maj":
    default: return [0, 4, 7];
  }
}

export function findClosestOctave(noteName, targetMidi) {
  let bestOctave = 4;
  let bestDiff = Infinity;

  for (let oct = 1; oct <= 6; oct++) {
    const midi = noteToMidi(noteName, oct);
    const diff = Math.abs(midi - targetMidi);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestOctave = oct;
    }
  }
  return bestOctave;
}

export function scaleNote(scaleNotes, degree) {
  const idx = (degree - 1) % scaleNotes.length;
  return scaleNotes[idx];
}

export function durationToNotation(beats) {
  return DURATION_LABELS[beats] || `${beats.toFixed(2)} beat`;
}

/**
 * Render numeric beats as Tone.js notation.
 * An unmapped value resolves to the nearest tabled duration rather than a fixed
 * quarter note, so a long note can never again be silently truncated.
 */
export function beatsToTone(beats) {
  const exact = TONE_BY_BEATS.get(beats);
  if (exact) return exact;
  const nearest = DURATION_TABLE.reduce((best, entry) =>
    Math.abs(entry.beats - beats) < Math.abs(best.beats - beats) ? entry : best,
  );
  return nearest.tone;
}

export function timeFromBar(bar, beatFraction) {
  const beats = Math.floor(beatFraction);
  const remainder = beatFraction - beats;
  const sixteenths = Math.round(remainder * 4);
  return `${bar}:${beats}:${sixteenths}`;
}

export function beatsToTransport(totalBeats) {
  const bar = Math.floor(totalBeats / 4);
  const beat = Math.floor(totalBeats % 4);
  const remainder = totalBeats - Math.floor(totalBeats);
  const sixteenth = Math.round(remainder * 4);
  return `${bar}:${beat}:${sixteenth}`;
}

export function transportToBeats(timeStr) {
  const parts = timeStr.split(":").map(Number);
  const bar = parts[0] || 0;
  const beat = parts[1] || 0;
  const sixteenth = parts[2] || 0;
  return bar * 4 + beat + sixteenth / 4;
}

export function toneToBeatsFromDuration(duration) {
  return BEATS_BY_TONE.get(duration) ?? 1;
}

// Letter, optional accidentals, then a possibly-negative octave. Parsing the
// octave positionally with slice(-1) split "C-1" into the name "C-" and the
// octave 1, yielding NaN; it also mis-read any two-digit octave.
const NOTE_STRING_PATTERN = /^([A-Ga-g])([#b♯♭]{0,2})(-?\d{1,2})$/;

/**
 * Parse a note string such as "C4", "Eb3" or "F#-1" into a MIDI number.
 * Returns NaN for anything unparseable rather than a plausible wrong answer.
 */
export function noteStringToMidi(noteStr) {
  if (typeof noteStr !== "string") return Number.NaN;
  const match = NOTE_STRING_PATTERN.exec(noteStr.trim());
  if (!match) return Number.NaN;
  const [, letter, accidentals, octave] = match;
  const name = letter.toUpperCase() + accidentals.replace(/♯/g, "#").replace(/♭/g, "b");
  if (NOTE_TO_INDEX[name] === undefined) return Number.NaN;
  return noteToMidi(name, Number(octave));
}

/** Remove a trailing octave, including a negative one ("C-1" -> "C"). */
export function stripOctave(note) {
  return typeof note === "string" ? note.replace(/-?\d+$/, "") : "";
}

export function getQuality(symbol) {
  const trimmed = symbol.replace(/[^A-Za-z]/g, "");
  if (/dim/i.test(symbol) || /o$/i.test(trimmed) || /\u00B0/.test(symbol)) return "diminished";
  if (trimmed && trimmed.toLowerCase() === "vii" && trimmed === trimmed.toLowerCase()) return "diminished";
  if (!trimmed) return "major";
  return trimmed === trimmed.toUpperCase() ? "major" : "minor";
}

export function parseRomanSymbol(symbol) {
  const match = symbol.match(/^([b#]*)([IViv]+)(o|dim)?(maj7|7)?(?:\/([b#]*)([IViv]+))?$/);

  const accidentalStr = match?.[1] || "";
  const numeral = match?.[2] || symbol.replace(/[^IViv]/g, "");
  const dimToken = match?.[3] || "";
  const extToken = match?.[4] || "";
  const secAccStr = match?.[5] || "";
  const secNumeral = match?.[6] || "";

  const accidental = (accidentalStr.match(/#/g) || []).length - (accidentalStr.match(/b/g) || []).length;

  const degree = ROMAN_TO_DEGREE[numeral] ?? 0;

  let quality = getQuality(numeral);
  let qualityExplicit = false;
  if (dimToken || /o$/i.test(numeral) || /dim/i.test(symbol)) {
    quality = "diminished";
    qualityExplicit = true;
  }

  const extension = extToken || "";
  if (extension) {
    qualityExplicit = true;
  }

  const secondaryTargetDegree = secNumeral ? ROMAN_TO_DEGREE[secNumeral] : null;
  const secondaryAccidental = (secAccStr.match(/#/g) || []).length - (secAccStr.match(/b/g) || []).length;

  return {
    degree,
    accidental,
    quality,
    numeral,
    extension,
    qualityExplicit,
    secondaryTargetDegree,
    secondaryAccidental,
    accStr: accidentalStr,
    secondaryAccStr: secAccStr,
  };
}

function triadTagToQualityWord(tag) {
  if (!tag) return null;
  if (tag === "min" || tag === "minor") return "minor";
  if (tag === "dim" || tag === "diminished") return "diminished";
  return "major";
}

function resolveTriadQuality(parsed, options = {}) {
  const mode = options.mode ? normalizeModeId(options.mode) : null;
  const degree = options.degree ?? parsed.degree;
  const preferModeQuality = options.preferModeQuality !== false;
  const modeQualityTag =
    options.modeQuality ??
    (mode && typeof degree === "number" ? MODE_CHORD_QUALITIES[mode]?.[degree] : null);
  const modeQuality = triadTagToQualityWord(modeQualityTag);
  const romanQuality = parsed.quality || null;
  const hasExplicitQuality = !!parsed.qualityExplicit;

  if (romanQuality) {
    if (!preferModeQuality) return romanQuality;
    if (hasExplicitQuality) return romanQuality;
    if (!modeQuality || romanQuality === modeQuality) return romanQuality;
  }

  if (preferModeQuality && modeQuality) return modeQuality;
  if (romanQuality) return romanQuality;
  return "major";
}

export function inferChordTagFromParsed(parsed, options = {}) {
  const { extension, secondaryTargetDegree } = parsed;
  const triadQuality = resolveTriadQuality(parsed, options);

  if (extension === "maj7") return "maj7";
  if (extension === "7") {
    if (triadQuality === "minor") return "min7";
    if (triadQuality === "diminished") return "hdim7";
    return "dom7";
  }

  if (secondaryTargetDegree != null) {
    return "dom7";
  }

  if (triadQuality === "diminished") return "dim";
  if (triadQuality === "minor") return "min";
  return "maj";
}

export function getChordTagForSymbol(symbol, options = {}) {
  const parsed = options.parsed || parseRomanSymbol(symbol);
  const degree = options.degree ?? parsed.degree;
  const mode = options.mode ? normalizeModeId(options.mode) : undefined;
  const preferModeQuality = options.preferModeQuality !== false;
  const triadQuality = resolveTriadQuality(parsed, { mode, degree, preferModeQuality });
  let chordTag = inferChordTagFromParsed(parsed, { mode, degree, preferModeQuality });
  const allowStyleOverrides = !!options.applyStyleOverrides;
  const styleProfile = options.styleProfile;

  if (
    allowStyleOverrides &&
    styleProfile &&
    typeof styleProfile.getChordTag === "function" &&
    !parsed.extension
  ) {
    const styled = styleProfile.getChordTag(symbol, triadQuality, {
      isSecondary: parsed.secondaryTargetDegree != null,
    });
    if (styled) chordTag = styled;
  }

  return chordTag;
}

export function formatChordLabel(rootNote, chordTag) {
  const suffix =
    chordTag === "maj7" ? "maj7" :
    chordTag === "min7" ? "m7" :
    chordTag === "dom7" ? "7" :
    chordTag === "hdim7" ? "hdim7" :
    chordTag === "min" ? "m" :
    chordTag === "dim" ? "dim" :
    "";
  return `${rootNote}${suffix}`;
}

export function buildChord(symbol, key, scale, options = {}) {
  const parsed = parseRomanSymbol(symbol);
  const mode = normalizeModeId(options.mode || scale?.mode);
  const styleProfile = options.styleProfile;
  const applyStyleOverrides = !!options.applyStyleOverrides;
  const preferModeQuality = options.preferModeQuality !== false;
  const degree = parsed.degree;
  const accidental = parsed.accidental;
  const preferFlatExplicit = (parsed.accStr || "").includes("b");
  const preferSharpExplicit = (parsed.accStr || "").includes("#");
  const keyPrefersFlat = prefersFlatKeySignature(key || scale?.key, mode);
  const baseIndex = NOTE_TO_INDEX[key] ?? NOTE_TO_INDEX.C;
  const harmonicIntervals = getHarmonicIntervals(mode);

  const resolveInterval = (idx) => {
    const interval = harmonicIntervals[idx];
    if (typeof interval === "number") return interval;
    return MAJOR_SCALE_STEPS[idx] ?? 0;
  };

  const buildVoicing = (rootNote, chordTag) => {
    const intervals = chordTagToIntervals(chordTag);
    const targetChordMidi = noteToMidi("C", 4);
    const chordRootOctave = findClosestOctave(rootNote, targetChordMidi);
    const rootMidi = noteToMidi(rootNote, chordRootOctave);
    return {
      chordNotes: intervals.map((i) => midiToNote(rootMidi + i)),
      bassNotes: intervals.map((i) => midiToNote(rootMidi - 12 + i)),
    };
  };

  const isSecondary = parsed.secondaryTargetDegree != null;

  if (isSecondary) {
    const preferSecondaryFlatExplicit = (parsed.secondaryAccStr || "").includes("b");
    const preferSecondarySharpExplicit = (parsed.secondaryAccStr || "").includes("#");
    const preferSecondaryFlat = preferSecondaryFlatExplicit
      ? true
      : preferSecondarySharpExplicit
      ? false
      : keyPrefersFlat;
    const targetOffset = resolveInterval(parsed.secondaryTargetDegree) + parsed.secondaryAccidental;
    const targetRootIndex = (baseIndex + targetOffset + 120) % 12;
    const secRootIndex = (targetRootIndex + 7) % 12;
    const rootNote = noteNameFromIndex(secRootIndex, preferSecondaryFlat);
    const chordTag = getChordTagForSymbol(symbol, {
      parsed,
      mode,
      degree,
      styleProfile,
      applyStyleOverrides,
      preferModeQuality,
    });
    const { chordNotes, bassNotes } = buildVoicing(rootNote, chordTag);
    const label = formatChordLabel(rootNote, chordTag);

    return {
      symbol,
      label,
      quality: chordTag,
      chordNotes,
      bassNotes,
      root: rootNote,
      mode,
    };
  }

  const rootOffset = resolveInterval(degree) + accidental;
  const rootNoteIndex = (baseIndex + rootOffset + 120) % 12;
  const preferFlatResolved = preferFlatExplicit ? true : preferSharpExplicit ? false : keyPrefersFlat;
  const rootNote = noteNameFromIndex(rootNoteIndex, preferFlatResolved);
  const chordTag = getChordTagForSymbol(symbol, {
    parsed,
    mode,
    degree,
    styleProfile,
    applyStyleOverrides,
    preferModeQuality,
  });
  const { chordNotes, bassNotes } = buildVoicing(rootNote, chordTag);
  const label = formatChordLabel(rootNote, chordTag);

  return {
    symbol,
    label,
    quality: chordTag,
    chordNotes,
    bassNotes,
    root: rootNote,
    mode,
  };
}

export function labelRomanWithTag(roman, tag, parsed) {
  const halfDimLabel = "hdim7";

  if (parsed.extension) {
    return roman;
  }

  const triadQuality = chordTagToTriadQualityWord(tag) || parsed.quality;
  const formattedBase = formatRomanByQuality(parsed, triadQuality) || roman;

  const suffix =
    tag === "maj7" ? "maj7" :
    tag === "min7" ? "7" :
    tag === "dom7" ? "7" :
    tag === "hdim7" ? halfDimLabel :
    tag === "min" ? "" :
    tag === "dim" ? "dim" :
    "";

  if (parsed.secondaryTargetDegree != null) {
    const formattedTarget = formatSecondaryTargetRoman(parsed) || roman.split("/")[1] || "V";
    const appliedSuffix =
      tag === "maj7" ? "7" :
      tag === "min7" ? "7" :
      tag === "dom7" ? "7" :
      tag === "hdim7" ? halfDimLabel :
      tag === "dim" ? "dim" :
      "";
    return `${formattedBase}${appliedSuffix}/${formattedTarget}`;
  }

  return `${formattedBase}${suffix}`;
}

function chordTagToTriadQualityWord(tag) {
  if (!tag) return null;
  if (tag.startsWith("maj")) return "major";
  if (tag === "dom7") return "major";
  if (tag.startsWith("min")) return "minor";
  if (tag === "dim" || tag === "hdim7") return "diminished";
  return "major";
}

function formatRomanByQuality(parsed, triadQuality = "major") {
  const baseRoman = DEGREE_TO_ROMAN[parsed.degree] || parsed.numeral || "I";
  const shouldLower = triadQuality === "minor" || triadQuality === "diminished";
  const core = shouldLower ? baseRoman.toLowerCase() : baseRoman.toUpperCase();
  const accidental = parsed.accStr || "";
  return `${accidental}${core}`;
}

function formatSecondaryTargetRoman(parsed) {
  if (parsed.secondaryTargetDegree == null) return null;
  const targetBase = DEGREE_TO_ROMAN[parsed.secondaryTargetDegree] || "I";
  const accidental = parsed.secondaryAccStr || "";
  return `${accidental}${targetBase.toUpperCase()}`;
}

export function analyzeRomanAgainstMode(symbol, mode) {
  const parsed = typeof symbol === "string" ? parseRomanSymbol(symbol) : { ...symbol };
  const normalizedMode = normalizeModeId(mode);
  const degreeIdx = typeof parsed.degree === "number" ? parsed.degree : null;
  const diatonicQualityTag =
    degreeIdx != null ? MODE_CHORD_QUALITIES[normalizedMode]?.[degreeIdx] : null;
  const diatonicQuality = triadTagToQualityWord(diatonicQualityTag);
  const romanQuality = parsed.quality || null;
  const hasAccidental = (parsed.accStr || "").length > 0;
  const isSecondary = parsed.secondaryTargetDegree != null;
  const hasExplicitQuality = !!parsed.qualityExplicit;

  let reasonCode = null;
  let reasonLabel = null;

  if (isSecondary) {
    reasonCode = "secondary";
    reasonLabel = `Secondary function targeting ${formatSecondaryTargetRoman(parsed) || "another chord"}`;
  } else if (hasAccidental) {
    reasonCode = "accidental";
    const baseRoman = degreeIdx != null ? DEGREE_TO_ROMAN[degreeIdx] : "";
    reasonLabel = `Chromatic alteration (${parsed.accStr}${baseRoman})`;
  } else if (hasExplicitQuality && diatonicQuality && romanQuality && romanQuality !== diatonicQuality) {
    reasonCode = "quality";
    reasonLabel = `Altered quality (${romanQuality} vs diatonic ${diatonicQuality})`;
  } else if (!diatonicQuality) {
    reasonCode = "undefined";
    reasonLabel = `${MODE_LABELS[normalizedMode] || normalizedMode} lacks a triad on this degree`;
  }

  const diatonicRoman =
    degreeIdx != null
      ? formatRomanByQuality(
          { ...parsed, accStr: "", accidental: 0 },
          diatonicQuality || romanQuality || "major"
        )
      : null;

  return {
    mode: normalizedMode,
    isDiatonic: !reasonCode,
    reasonCode,
    reasonLabel,
    diatonicRoman,
  };
}
