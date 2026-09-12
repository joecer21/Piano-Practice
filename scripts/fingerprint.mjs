// Musical fingerprint: guards the generated music across the property seeds and
// the mode-by-key coverage grid.
//   node scripts/fingerprint.mjs            # report drift vs the committed baseline
//   node scripts/fingerprint.mjs --write    # re-freeze baseline + curated fixtures
// The Score fingerprint is separate; see scripts/score-fingerprint.mjs.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { assignmentForCase, fingerprintMatrix, musicalFacts } from "../tests/support/fingerprint.js";

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
const total = Object.keys(matrix).length;

if (write) {
  writeFileSync(BASELINE, JSON.stringify(matrix, null, 2) + "\n");
  for (const seed of CURATED_SEEDS) {
    const target = new URL(`${seed}.json`, CURATED);
    writeFileSync(target, JSON.stringify(musicalFacts(assignmentForCase(seed)), null, 2) + "\n");
  }
  console.log(`wrote musical fingerprint (${total} cases) + ${CURATED_SEEDS.length} curated fixtures`);
} else {
  if (!existsSync(BASELINE)) {
    console.error("no musical fingerprint baseline; run with --write");
    process.exit(1);
  }
  const previous = JSON.parse(readFileSync(BASELINE, "utf8"));
  const added = Object.keys(matrix).filter((id) => !(id in previous));
  const removed = Object.keys(previous).filter((id) => !(id in matrix));
  const moved = Object.keys(matrix).filter((id) => id in previous && previous[id] !== matrix[id]);
  if (!added.length && !removed.length && !moved.length) {
    console.log(`musical fingerprint: all ${total} cases unchanged`);
    process.exit(0);
  }
  if (moved.length) {
    console.log(`musical fingerprint: ${moved.length} case(s) moved:`);
    for (const id of moved) console.log(`  ${id}  ${previous[id]} -> ${matrix[id]}`);
  }
  if (added.length)
    console.log(`musical fingerprint: ${added.length} case(s) not yet frozen: ${added.join(", ")}`);
  if (removed.length)
    console.log(`musical fingerprint: ${removed.length} frozen case(s) no longer generated`);
  process.exit(1);
}
