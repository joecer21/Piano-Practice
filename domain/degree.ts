import type { DegreeAlteration, DegreeNumber, DegreeToken } from "./score.js";

/**
 * Scale degrees are named against the major scale, the way musicians say them:
 * natural minor is 1 2 ♭3 4 5 ♭6 ♭7, minor pentatonic is 1 ♭3 4 5 ♭7, and the
 * blues note is ♭5. A degree therefore names a pitch relative to the key, and
 * "♭3" means the same thing in every mode and every key.
 *
 * The previous numbering counted positions within the mode's own scale, so the
 * minor third was "3" in natural minor and "2" in minor pentatonic.
 */
export const DEGREE_REFERENCE_SIZE = 7 as const;

type Spelling = readonly [number: DegreeNumber, alteration: DegreeAlteration];

// Semitones above the root -> degree. Semitone 6 is the one genuinely ambiguous
// spelling and is resolved against the mode below.
const SPELLING_BY_SEMITONE: readonly Spelling[] = [
  [1, 0],
  [2, -1],
  [2, 0],
  [3, -1],
  [3, 0],
  [4, 0],
  [4, 1],
  [5, 0],
  [6, -1],
  [6, 0],
  [7, -1],
  [7, 0],
];

const FLAT_FIVE: Spelling = [5, -1];

/**
 * @param semitonesAboveRoot pitch class relative to the key's root (any integer)
 * @param scaleIntervals the mode's intervals above the root
 * @param octaveOffset how many octaves above the reference octave (extensions)
 */
export function degreeForInterval(
  semitonesAboveRoot: number,
  scaleIntervals: readonly number[],
  octaveOffset = 0,
): DegreeToken {
  const semitone = ((semitonesAboveRoot % 12) + 12) % 12;
  const modeUsesTritone = scaleIntervals.some((interval) => ((interval % 12) + 12) % 12 === 6);
  // The tritone is ♭5 where the mode itself contains it (the blues scales), and
  // ♯4 as a chromatic neighbour of an ordinary major or minor scale.
  const [number, alteration] = semitone === 6 && modeUsesTritone ? FLAT_FIVE : SPELLING_BY_SEMITONE[semitone];
  return { number, alteration, octaveOffset, scaleSize: DEGREE_REFERENCE_SIZE };
}
