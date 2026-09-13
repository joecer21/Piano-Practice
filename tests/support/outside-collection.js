// Outside-collection notes: a chord-aware compatibility review of the motif catalog
// against the pentatonic and blues collections.
//
// Parent-degree motifs play a degree the selected collection leaves out from the
// mode's seven-note parent scale, rather than replacing it. Whether that is a
// deliberate colour or undermines the scale being practised depends on the chord
// under the note, where it falls in the bar, how long and loud it is, and how it is
// approached and left. This collects those facts for every pattern and mode, sets
// them beside each pattern's declared collectionFit, and auditions candidate
// variants. A note is called a passing tone only when it is approached and left by
// step in the same direction.
//
// Loads domain/score.ts, so it runs under Vitest.

import { buildScore } from "../../domain/score.ts";
import { formatDegreeToken } from "../../domain/describe.ts";
import { DEFAULT_ASSIGNMENT_INPUTS, generateAssignment } from "../../domain/assignment.js";
import {
  COLLECTION_CHARACTERISTIC_TONES,
  COLLECTION_MODE_IDS,
  MODE_LABELS,
  MOTIF_STYLES,
  NOTE_TO_INDEX,
  SCALE_PATTERNS,
  STYLE_PROFILES,
  defineMotifStyle,
  getProgressionPreset,
  midiToNote,
} from "../../theory.js";

export const COLLECTION_MODES = COLLECTION_MODE_IDS;

/** A note held this long or longer counts as long. */
export const LONG_NOTE_BEATS = 1.5;

const REPORT_KEY = "A";
const REPORT_STYLE = "pop";

/** Each collection is heard over the progression the app offers for practising it. */
export const REPORT_PROGRESSIONS = Object.freeze({
  pentatonicMajor: "pent-bootcamp",
  pentatonicMinor: "pent-bootcamp",
  majorBlues: "blues-12",
  minorBlues: "blues-12-minor",
});

const ROLE_WORDS = {
  root: "root",
  chordTone: "chord tone",
  scaleTone: "collection tone",
  parentScaleTone: "borrowed, not in chord",
  chromatic: "chromatic, not in chord",
};

function assignmentFor(motifId, mode, styleId = REPORT_STYLE) {
  const progressionPresetId = REPORT_PROGRESSIONS[mode];
  return generateAssignment({
    ...DEFAULT_ASSIGNMENT_INPUTS,
    key: REPORT_KEY,
    mode,
    motifId,
    styleId,
    progressionPresetId,
    length: getProgressionPreset(progressionPresetId).roman.length,
    seed: `outside-collection:${motifId}:${mode}`,
  });
}

/** Every note event of the Score's right hand, with its place in the motif cycle. */
function motifOccurrences(score) {
  const cycle = score.meta.rhCycleBeats ?? score.meta.totalBeats;
  const notes = score.parts.rh.filter((event) => event.kind === "note");
  const perCycle = notes.filter((event) => event.startBeat < cycle).length;
  return notes.map((event, index) => ({ event, noteIndex: index % perCycle, cycle }));
}

/**
 * Where a note falls in the bar it actually sounds in. Measured from the start of
 * the progression, not the motif: a 6- or 7-beat motif crosses the barline at a
 * different point on each repeat.
 */
function metricPosition(startBeat) {
  const beat = startBeat % 4;
  const strength =
    beat === 0 ? "downbeat" : beat === 2 ? "strong beat" : Number.isInteger(beat) ? "weak beat" : "offbeat";
  return { beat: beat + 1, strength, label: `beat ${beat + 1} (${strength})` };
}

const beatsText = (beats) => `${beats} ${beats === 1 ? "beat" : "beats"}`;

function intervalWord(semitones) {
  const size = Math.abs(semitones);
  const direction = semitones > 0 ? "up" : "down";
  if (size === 0) return "repeat";
  return `${size <= 2 ? "step" : "leap"} ${direction}`;
}

/**
 * How a note sits in the line: approach and departure are measured to the nearest
 * different pitch on each side, wrapping around the motif cycle, so a repeated note
 * is judged as one held gesture.
 */
export function melodicFunction(midis, index) {
  const n = midis.length;
  const here = midis[index];
  const nearestDifferent = (direction) => {
    for (let step = 1; step < n; step += 1) {
      const candidate = midis[(((index + direction * step) % n) + n) % n];
      if (candidate !== here) return candidate;
    }
    return here;
  };
  const previous = nearestDifferent(-1);
  const next = nearestDifferent(1);
  const approach = here - previous;
  const departure = next - here;
  const repeated = midis[(index - 1 + n) % n] === here || midis[(index + 1) % n] === here;
  const stepIn = approach !== 0 && Math.abs(approach) <= 2;
  const stepOut = departure !== 0 && Math.abs(departure) <= 2;

  let name;
  if (approach === 0 && departure === 0) name = "static";
  else if (stepIn && stepOut && Math.sign(approach) === Math.sign(departure)) name = "passing tone";
  else if (stepIn && stepOut) name = previous === next ? "neighbour tone" : "changing tone";
  else if (!stepIn && stepOut) name = "appoggiatura (leap in, step out)";
  else if (stepIn && !stepOut) name = "escape tone (step in, leap out)";
  else if (Math.sign(approach) === Math.sign(departure)) name = "arpeggiated (leaps on the same way)";
  else name = "unresolved (leap in, leap back)";

  return {
    name,
    repeated,
    previous,
    next,
    approach: intervalWord(approach),
    departure: intervalWord(departure),
    resolvesByStep: stepOut,
  };
}

function isStructural(occurrence) {
  const { metric, event, accented, melodic } = occurrence;
  const resolves =
    ["passing tone", "neighbour tone", "changing tone"].includes(melodic.name) ||
    melodic.name.startsWith("appoggiatura");
  return (
    metric.strength === "downbeat" ||
    event.durationBeats >= LONG_NOTE_BEATS ||
    accented ||
    (metric.strength === "strong beat" && (!resolves || melodic.repeated))
  );
}

/**
 * The outside-collection notes of one pattern in one mode, one row per note of the
 * motif cycle per chord it sounds over.
 */
export function analyzeCombination(motifId, mode) {
  const styles = Object.keys(STYLE_PROFILES).map((styleId) => {
    const assignment = assignmentFor(motifId, mode, styleId);
    return { styleId, assignment, score: buildScore(assignment) };
  });
  const main = styles.find((style) => style.styleId === REPORT_STYLE);
  const occurrences = motifOccurrences(main.score);
  const firstCycle = occurrences.filter((o) => o.event.startBeat < o.cycle);
  const midis = firstCycle.map((o) => o.event.midi);
  const tokens = main.assignment.motif.steps.filter((step) => !step.rest).map((step) => String(step.degree));
  const styleOccurrences = styles.map((style) => ({
    styleId: style.styleId,
    occurrences: motifOccurrences(style.score),
  }));
  const accentStyles = (occurrenceIndex) =>
    styleOccurrences
      .filter((style) => style.occurrences[occurrenceIndex]?.event.dynamic === "accent")
      .map((style) => style.styleId);

  const groups = new Map();
  for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
    const { event, noteIndex } = occurrence;
    if (event.scaleMembership === "collection") continue;
    const bar = main.score.bars[event.barIndex];
    const metric = metricPosition(event.startBeat);
    const key = `${noteIndex}|${metric.beat}|${bar.chordSymbol}|${event.role}`;
    if (groups.has(key)) {
      groups.get(key).count += 1;
      continue;
    }
    const melodic = melodicFunction(midis, noteIndex);
    const accentedIn = accentStyles(occurrenceIndex);
    const row = {
      motifId,
      mode,
      noteIndex,
      token: tokens[noteIndex],
      degree: formatDegreeToken(event.degree),
      pitch: midiToNote(event.midi),
      scaleMembership: event.scaleMembership,
      chord: bar.chordSymbol,
      chordRole: event.role,
      metric,
      event,
      durationBeats: event.durationBeats,
      dynamic: event.dynamic,
      accented: event.dynamic === "accent",
      accentedIn,
      melodic,
      previous: describePitch(melodic.previous, main.score),
      following: describePitch(melodic.next, main.score),
      count: 1,
    };
    row.structural = isStructural(row);
    groups.set(key, row);
  }
  const rows = [...groups.values()].sort(
    (a, b) => a.noteIndex - b.noteIndex || a.metric.beat - b.metric.beat || a.chord.localeCompare(b.chord),
  );
  const declared = MOTIF_STYLES[motifId]?.collectionFit?.[mode] ?? null;
  return {
    motifId,
    mode,
    tokens,
    cycleDegrees: firstCycle.map((o) => formatDegreeToken(o.event.degree)),
    cyclePitches: firstCycle.map((o) => midiToNote(o.event.midi)),
    cycleMemberships: firstCycle.map((o) => o.event.scaleMembership),
    firstCycle,
    chordAt: (event) => main.score.bars[event.barIndex].chordSymbol,
    rows,
    outsideDegrees: [...new Set(rows.map((row) => row.degree))],
    declared,
    suggested: rows.length === 0 ? "strict" : rows.some((row) => row.structural) ? "incompatible" : "color",
  };
}

function describePitch(midi, score) {
  const interval = (((midi - score.meta.rootPitchClass) % 12) + 12) % 12;
  const event = score.parts.rh.find((candidate) => candidate.kind === "note" && candidate.midi === midi);
  return `${midiToNote(midi)} (${event ? formatDegreeToken(event.degree) : interval})`;
}

/** Every catalog pattern in every pentatonic and blues mode it is written for. */
export function analyzeCatalog() {
  return Object.keys(MOTIF_STYLES).flatMap((motifId) =>
    COLLECTION_MODES.filter((mode) => MOTIF_STYLES[motifId].modes.includes(mode)).map((mode) =>
      analyzeCombination(motifId, mode),
    ),
  );
}

/** Flat list of outside-collection notes, one per note and chord. */
export function outsideCollectionNotes(analyses = analyzeCatalog()) {
  return analyses.flatMap((analysis) =>
    analysis.rows.map((row) => ({ ...row, interpretation: MOTIF_STYLES[row.motifId].degreeInterpretation })),
  );
}

/** Candidate variants heard before choosing what to ship. */
export const AUDITIONS = Object.freeze([
  {
    question: "A funk-sync for major pentatonic and major blues",
    candidates: [
      {
        id: "funk-sync-6",
        tokens: [1, 1, 5, 1, 4, 5, 6, 1],
        modes: ["pentatonicMajor", "majorBlues"],
        shipped: true,
        verdict:
          "Shipped. The 6 takes the downbeat the major 7 had, and it is in both collections, so the groove's accent now lands on the pentatonic's own colour.",
      },
      {
        id: "funk-sync-3",
        tokens: [1, 1, 5, 1, 4, 5, 3, 1],
        modes: ["pentatonicMajor", "majorBlues"],
        shipped: false,
        verdict:
          "Not shipped. Also strict, but the 3 only restates the tonic chord; it loses the lift funk-sync's upper note is there for.",
      },
    ],
  },
  {
    question: "A blues riff for minor blues that features ♭5",
    candidates: [
      {
        id: "blues-riff-minor",
        tokens: [1, "b3", 4, "b5", 4, 1],
        modes: ["minorBlues"],
        shipped: true,
        verdict:
          "Shipped. The ♭5 is struck on beat 3 and falls a half step to 4: the blue note is heard, and heard to resolve.",
      },
      {
        id: "blues-riff-minor-passing",
        tokens: [1, "b3", 4, 4, "b5", 5],
        modes: ["minorBlues"],
        shipped: false,
        verdict:
          "Not shipped. The ♭5 is a genuine chromatic passing tone from 4 to 5, but as an offbeat eighth it is easy to play past without hearing it.",
      },
    ],
  },
  {
    question: "A blues riff for major blues with ♭3-to-3 motion",
    candidates: [
      {
        id: "blues-riff-major",
        tokens: [1, "b3", 3, 5, 6, 5],
        modes: ["majorBlues"],
        shipped: true,
        verdict:
          "Shipped. The ♭3 is an offbeat pickup that curls up into the 3 on beat 2, so the major third is where the riff lands.",
      },
      {
        id: "blues-riff-major-crush",
        tokens: [5, 6, 1, "b3", 3, 1],
        modes: ["majorBlues"],
        shipped: false,
        verdict:
          "Not shipped. It puts the ♭3 on strong beat 3 against the chord's major third and resolves only on the offbeat; the shipped curl keeps the ♭3 off the beat and lands the 3 on one.",
      },
    ],
  },
]);

const RIFF_RHYTHM = [0.5, 0.5, 1, 0.5, 0.5, 1];
const FUNK_SYNC_RHYTHM = [0.5, "r0.5", 0.5, 1.5, "r0.5", 0.5, 1, 3];

function auditionStyle(candidate) {
  const catalog = MOTIF_STYLES[candidate.id];
  const funk = candidate.id.startsWith("funk-sync");
  const rhythm = (funk ? FUNK_SYNC_RHYTHM : RIFF_RHYTHM).map((beats) =>
    typeof beats === "string" ? { beats: Number(beats.slice(1)), rest: true } : { beats, rest: false },
  );
  return defineMotifStyle(candidate.id, {
    ...(catalog ?? {}),
    label: catalog?.label ?? candidate.id,
    description: catalog?.description ?? "Audition candidate.",
    category: funk ? "groove" : "blues",
    difficulty: "intermediate",
    bars: funk ? 2 : 1,
    rhythm: catalog?.rhythm ?? rhythm,
    degreePattern: candidate.tokens,
    modes: candidate.modes,
    collectionFit: Object.fromEntries(candidate.modes.map((mode) => [mode, { fit: "strict" }])),
  });
}

/** Hear a candidate as if it were in the catalog, then put the catalog back. */
export function auditionCandidate(candidate) {
  const previous = MOTIF_STYLES[candidate.id];
  MOTIF_STYLES[candidate.id] = auditionStyle(candidate);
  try {
    return candidate.modes.map((mode) => analyzeCombination(candidate.id, mode));
  } finally {
    if (previous) MOTIF_STYLES[candidate.id] = previous;
    else delete MOTIF_STYLES[candidate.id];
  }
}

const TONE_SEMITONES = Object.freeze({ 6: 9, "♭7": 10, "♭3": 3, "♭5": 6 });

/** Whether a note event sounds a characteristic tone, in any octave. */
export function sounds(event, tone, rootPitchClass = NOTE_TO_INDEX[REPORT_KEY]) {
  return (((event.midi - rootPitchClass) % 12) + 12) % 12 === TONE_SEMITONES[tone];
}

// ---- Markdown -----------------------------------------------------------------

const modeName = (mode) => MODE_LABELS[mode] ?? mode;

function fitCell(motifId, mode) {
  const style = MOTIF_STYLES[motifId];
  if (!style.modes.includes(mode)) return "-";
  const entry = style.collectionFit[mode];
  const exemplar = entry.exemplar ? " (exemplar)" : "";
  if (entry.fit === "color") return `color: ${entry.colorTones.join(", ")}${exemplar}`;
  if (entry.fit === "incompatible") return `**incompatible**${entry.variant ? ` → ${entry.variant}` : ""}`;
  return `strict${exemplar}`;
}

function occurrenceTable(rows) {
  return [
    "| Note # | Token | Sounds as | Chord | Chord role | Metric position | Duration | Accent | Preceding | Following | Melodic function | Times |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => {
      const accent = row.accented
        ? `**accent** (${row.accentedIn.join(", ")})`
        : row.accentedIn.length
          ? `${row.dynamic}; accent in ${row.accentedIn.join(", ")}`
          : row.dynamic;
      const func = `${row.melodic.name}${row.melodic.repeated ? ", repeated" : ""}: ${row.melodic.approach} in, ${row.melodic.departure} out`;
      const membership = row.scaleMembership === "chromatic" ? "outside the parent scale" : "borrowed";
      const role =
        row.chordRole === "root" || row.chordRole === "chordTone"
          ? `${ROLE_WORDS[row.chordRole]} (${membership})`
          : row.scaleMembership === "chromatic"
            ? ROLE_WORDS.chromatic
            : ROLE_WORDS.parentScaleTone;
      const metric =
        row.structural && (row.metric.strength === "downbeat" || row.metric.strength === "strong beat")
          ? `**${row.metric.label}**`
          : row.metric.label;
      const duration =
        row.durationBeats >= LONG_NOTE_BEATS
          ? `**${beatsText(row.durationBeats)}**`
          : beatsText(row.durationBeats);
      return `| ${row.noteIndex + 1} | ${row.token} | ${row.degree} (${row.pitch}) | ${row.chord} | ${role} | ${metric} | ${duration} | ${accent} | ${row.previous} | ${row.following} | ${func} | ${row.count} |`;
    }),
  ];
}

export function renderOutsideCollectionReport(analyses = analyzeCatalog()) {
  const ids = Object.keys(MOTIF_STYLES);
  const byFit = (fit) =>
    analyses.filter((analysis) => analysis.declared?.fit === fit).map((analysis) => analysis);
  const incompatible = byFit("incompatible");
  const colorFits = byFit("color");
  const variants = ids.filter((id) => MOTIF_STYLES[id].modes.length < Object.keys(SCALE_PATTERNS).length);
  const judgment = analyses.filter(
    (analysis) => analysis.declared && analysis.declared.fit !== analysis.suggested,
  );

  const lines = [
    "# Outside-collection notes: motif compatibility review",
    "",
    `Every motif pattern in every pentatonic and blues mode, in the key of ${REPORT_KEY}, heard over the progression offered for that collection (${COLLECTION_MODES.map((mode) => `${modeName(mode)}: ${REPORT_PROGRESSIONS[mode]}`).join("; ")}), in the ${REPORT_STYLE} style. Accent is also checked in every other style.`,
    "",
    "Degrees name the pitch against the major scale, so they hold in every key. A note is a **passing tone** only when approached and left by step in the same direction; otherwise it is named by its motion (neighbour, appoggiatura, escape tone, unresolved).",
    "",
    "- **strict**: every note is in the collection.",
    "- **color**: deliberately uses the named parent-scale or chromatic tones, which Note by note identifies to the learner.",
    "- **incompatible**: structurally emphasizes a note that undermines the collection (downbeat, held, accented, or on a strong beat without stepwise resolution). Not offered for that mode; never repaired by changing notes.",
    "",
    "## Compatibility",
    "",
    `| Pattern | ${COLLECTION_MODES.map(modeName).join(" | ")} |`,
    `|---|${COLLECTION_MODES.map(() => "---").join("|")}|`,
    ...ids.map((id) => `| ${id} | ${COLLECTION_MODES.map((mode) => fitCell(id, mode)).join(" | ")} |`),
    "",
    "## Decisions",
    "",
    "**Excluded (incompatible, not offered):**",
    "",
    ...incompatible.map(
      (analysis) =>
        `- ${analysis.motifId} in ${modeName(analysis.mode)}: ${analysis.declared.reason}${analysis.declared.variant ? ` Replaced by ${analysis.declared.variant}.` : ""}`,
    ),
    "",
    "**Retained as color patterns:**",
    "",
    ...colorFits.map(
      (analysis) =>
        `- ${analysis.motifId} in ${modeName(analysis.mode)}: ${analysis.declared.colorTones.join(", ")}. ${analysis.declared.note}`,
    ),
    "",
    "**Variants written for a collection:**",
    "",
    ...variants.map(
      (id) => `- ${id} (${MOTIF_STYLES[id].modes.map(modeName).join(", ")}): ${MOTIF_STYLES[id].description}`,
    ),
    "",
    "## Characteristic tones",
    "",
    "| Mode | Characteristic tone | Exemplar | Where it sounds |",
    "|---|---|---|---|",
    ...COLLECTION_MODES.flatMap((mode) =>
      analyses
        .filter((analysis) => analysis.mode === mode && analysis.declared?.exemplar)
        .map((analysis) => {
          const tone = COLLECTION_CHARACTERISTIC_TONES[mode];
          const where = analysis.firstCycle
            .filter((o) => sounds(o.event, tone))
            .map(
              (o) =>
                `note ${o.noteIndex + 1}, ${metricPosition(o.event.startBeat).label}, ${beatsText(o.event.durationBeats)}, over ${analysis.chordAt(o.event)}`,
            )
            .join("; ");
          return `| ${modeName(mode)} | ${tone} | ${analysis.motifId} | ${where || "**not played**"} |`;
        }),
    ),
    "",
    "## Auditions",
    "",
  ];

  for (const audition of AUDITIONS) {
    lines.push(`### ${audition.question}`, "");
    for (const candidate of audition.candidates) {
      const results = auditionCandidate(candidate);
      lines.push(`**${candidate.id}** \`${candidate.tokens.join(" ")}\``, "");
      for (const result of results) {
        lines.push(
          `- ${modeName(result.mode)}: plays ${result.cyclePitches.join(" ")} = ${result.cycleDegrees.join(" ")}; ${result.rows.length ? `${result.rows.length} outside-collection note rows` : "strict"}.`,
        );
        const beats = result.firstCycle
          .map(
            (o) =>
              `${formatDegreeToken(o.event.degree)} @ ${metricPosition(o.event.startBeat).label}${o.event.dynamic === "accent" ? ", accented" : ""}, ${ROLE_WORDS[o.event.role]} of ${result.chordAt(o.event)}`,
          )
          .join("; ");
        lines.push(`  - ${beats}`);
      }
      lines.push("", candidate.verdict, "");
    }
  }

  lines.push(
    "## Judgment calls",
    "",
    "Where the declared fit differs from the mechanical suggestion (structural = downbeat, long, accented, or strong beat without stepwise resolution), with the reason the declaration stands.",
    "",
    ...(judgment.length
      ? judgment.map(
          (analysis) =>
            `- ${analysis.motifId} in ${modeName(analysis.mode)}: declared **${analysis.declared.fit}**, suggested ${analysis.suggested}. ${analysis.declared.reason ?? analysis.declared.note}`,
        )
      : ["- None."]),
    "",
    "## Chord-aware detail",
    "",
  );

  for (const analysis of analyses.filter((candidate) => candidate.rows.length)) {
    lines.push(
      `### ${analysis.motifId} · ${modeName(analysis.mode)} · ${analysis.declared?.fit ?? "undeclared"}`,
      "",
      `Tokens \`${analysis.tokens.join(" ")}\` play ${analysis.cyclePitches.join(" ")} = ${analysis.cycleDegrees.map((degree, index) => (analysis.cycleMemberships[index] === "collection" ? degree : `**${degree}**`)).join(" ")}.`,
      "",
      ...occurrenceTable(analysis.rows),
      "",
    );
  }

  return lines.join("\n");
}
