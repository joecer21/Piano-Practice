import { midiToNote, noteStringToMidi } from "../theory.js";

export const LIVE_PIANO_CHORD_MODES = Object.freeze({
  single: { label: "Single note", intervals: [0] },
  "diatonic-triad": { label: "Diatonic triad", scaleSteps: [0, 2, 4] },
  "diatonic-7th": { label: "Diatonic 7th", scaleSteps: [0, 2, 4, 6] },
  sus2: { label: "Sus2", intervals: [0, 2, 7] },
  sus4: { label: "Sus4", intervals: [0, 5, 7] },
  power5: { label: "Power 5", intervals: [0, 7] },
  maj6: { label: "Major 6", intervals: [0, 4, 7, 9] },
  min6: { label: "Minor 6", intervals: [0, 3, 7, 9] },
  add9: { label: "Add9", intervals: [0, 4, 7, 14] },
  quartal: { label: "Quartal stack", intervals: [0, 5, 10] },
  dom7: { label: "Dominant 7", intervals: [0, 4, 7, 10] },
  maj7: { label: "Major 7", intervals: [0, 4, 7, 11] },
  min7: { label: "Minor 7", intervals: [0, 3, 7, 10] },
});

export function getLivePianoChordNotes(rootNote, modeId = "single", scale = null) {
  const rootMidi = noteStringToMidi(rootNote);
  if (!Number.isFinite(rootMidi)) return [];
  const mode = LIVE_PIANO_CHORD_MODES[modeId] || LIVE_PIANO_CHORD_MODES.single;
  const intervals = mode.scaleSteps
    ? getDiatonicIntervals(rootMidi, scale, mode.scaleSteps) || [0]
    : mode.intervals;
  return normalizeRegister(intervals.map((interval) => rootMidi + interval)).map((midi) => midiToNote(midi));
}

function getDiatonicIntervals(rootMidi, scale, scaleSteps) {
  const pitchClasses = (scale?.notes || [])
    .map((note) => noteStringToMidi(`${note}4`))
    .filter(Number.isFinite)
    .map((midi) => ((midi % 12) + 12) % 12);
  if (pitchClasses.length < 5) return null;
  const rootPitchClass = ((rootMidi % 12) + 12) % 12;
  const rootIndex = pitchClasses.indexOf(rootPitchClass);
  if (rootIndex < 0) return null;

  return scaleSteps.map((step) => {
    const targetPitchClass = pitchClasses[(rootIndex + step) % pitchClasses.length];
    let interval = (targetPitchClass - rootPitchClass + 12) % 12;
    if (step > 0 && interval === 0) interval = 12;
    return interval;
  });
}

function normalizeRegister(midis, minMidi = 36, maxMidi = 88) {
  if (!midis.length) return [];
  let result = [...midis];
  while (Math.min(...result) < minMidi) result = result.map((midi) => midi + 12);
  while (Math.max(...result) > maxMidi) result = result.map((midi) => midi - 12);
  return result;
}
