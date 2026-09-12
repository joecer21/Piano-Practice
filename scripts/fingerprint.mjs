// Writes the musical fingerprint baseline and the curated readable fixtures.
//   node scripts/fingerprint.mjs            # report drift vs the committed baseline
//   node scripts/fingerprint.mjs --write    # rewrite baseline + curated fixtures
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { assignmentForSeed, fingerprintMatrix, musicalFacts } from "../tests/support/fingerprint.js";

const BASELINE = new URL("../tests/fixtures/musical-fingerprint.json", import.meta.url);
const CURATED = new URL("../tests/fixtures/curated/", import.meta.url);

// Six seeds kept human-readable so a failure can be read, not merely detected.
// Two of them (24, 4) exercise the motifs with long notes.
export const CURATED_SEEDS = [
  "property-0", // baseline pentatonic
  "property-4", // funk-sync: emits a 3-beat note
  "property-24", // modal-pedal: emits a 4-beat note
  "property-11",
  "property-50",
  "property-77",
];

const write = process.argv.includes("--write");
const matrix = fingerprintMatrix();

if (write) {
  writeFileSync(BASELINE, JSON.stringify(matrix, null, 2) + "\n");
  for (const seed of CURATED_SEEDS) {
    const target = new URL(`${seed}.json`, CURATED);
    writeFileSync(target, JSON.stringify(musicalFacts(assignmentForSeed(seed)), null, 2) + "\n");
  }
  console.log(
    `wrote baseline (${Object.keys(matrix).length} seeds) + ${CURATED_SEEDS.length} curated fixtures`,
  );
} else {
  if (!existsSync(BASELINE)) {
    console.error("no baseline; run with --write");
    process.exit(1);
  }
  const previous = JSON.parse(readFileSync(BASELINE, "utf8"));
  const moved = Object.keys(matrix).filter((seed) => previous[seed] !== matrix[seed]);
  if (!moved.length) {
    console.log("fingerprint: all 96 seeds unchanged");
    process.exit(0);
  }
  console.log(`fingerprint: ${moved.length} seed(s) moved:`);
  for (const seed of moved) console.log(`  ${seed}  ${previous[seed]} -> ${matrix[seed]}`);
  process.exit(1);
}
