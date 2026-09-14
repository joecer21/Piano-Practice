/**
 * Where the hands sit on the keyboard, measured from a Score: do they share or
 * cross keys, does the left hand stay in one place, and does the drawn chord
 * shape stay clear of the tune. Facts only; the thresholds live in the tests.
 */

const A1 = 33;

const notes = (score, part) => score.parts[part].filter((event) => event.kind === "note");

export function handGeometry(score) {
  const left = notes(score, "lh");
  const right = notes(score, "rh");
  const lhMidis = left.map((event) => event.midi);
  const rhMidis = right.map((event) => event.midi);
  const lhMin = lhMidis.length ? Math.min(...lhMidis) : null;
  const lhMax = lhMidis.length ? Math.max(...lhMidis) : null;
  const rhMin = rhMidis.length ? Math.min(...rhMidis) : null;

  // Keys both hands hold at the same moment, or where the right hand is below the left.
  let clashes = 0;
  let closestGap = null;
  for (const rh of right) {
    for (const lh of left) {
      const overlaps =
        lh.startBeat < rh.startBeat + rh.durationBeats && rh.startBeat < lh.startBeat + lh.durationBeats;
      if (!overlaps) continue;
      const gap = rh.midi - lh.midi;
      closestGap = closestGap == null ? gap : Math.min(closestGap, gap);
      if (gap <= 0) clashes += 1;
    }
  }

  // The lowest note of each bar is the bass the hand has to find.
  const bassByBar = score.bars.map((bar) => {
    const inBar = left.filter((event) => event.barIndex === bar.barIndex).map((event) => event.midi);
    return inBar.length ? Math.min(...inBar) : null;
  });
  let maxBassLeap = 0;
  let totalBassLeap = 0;
  for (let index = 1; index < bassByBar.length; index += 1) {
    const [before, after] = [bassByBar[index - 1], bassByBar[index]];
    if (before == null || after == null) continue;
    maxBassLeap = Math.max(maxBassLeap, Math.abs(after - before));
    totalBassLeap += Math.abs(after - before);
  }

  // The same chord played in a different place later: the hand ping-pongs.
  const placements = new Map();
  score.bars.forEach((bar, index) => {
    const inBar = left.filter((event) => event.barIndex === bar.barIndex).map((event) => event.midi);
    if (!inBar.length) return;
    const seen = placements.get(bar.roman) ?? new Set();
    seen.add(`${bassByBar[index]}|${Math.max(...inBar)}`);
    placements.set(bar.roman, seen);
  });
  const movedRepeatChords = [...placements.values()].filter((seen) => seen.size > 1).length;

  // The chord shape drawn on the keyboard in chord by chord.
  const shapeMidis = score.bars.flatMap((bar) => [...bar.voicingMidis.bass, ...bar.voicingMidis.chord]);
  const shapeMax = shapeMidis.length ? Math.max(...shapeMidis) : null;

  return {
    lhRange: lhMin == null ? null : [lhMin, lhMax],
    rhRange: rhMin == null ? null : [rhMin, Math.max(...rhMidis)],
    clashes,
    closestGap,
    zoneOverlap: lhMax != null && rhMin != null ? Math.max(0, lhMax - rhMin + 1) : 0,
    maxBassLeap,
    meanBassLeap: bassByBar.length > 1 ? totalBassLeap / (bassByBar.length - 1) : 0,
    movedRepeatChords,
    lhSpan: lhMin == null ? 0 : lhMax - lhMin,
    belowA1: lhMidis.filter((midi) => midi < A1).length,
    shapeOverlap: shapeMax != null && rhMin != null ? Math.max(0, shapeMax - rhMin + 1) : 0,
  };
}
