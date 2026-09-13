// Size budget for what a learner downloads, checked against the built dist/.
//
// Timings are too noisy for a CI gate, so the gate is on bytes, and the byte
// limits come from measured loading behaviour (docs/performance.md,
// `npm run perf`): on the phone profile (4x CPU, slow 4G) the assignment sentence
// appeared after ~2.1 s, dominated by downloading ~190 KB of compressed script
// and evaluating it (~0.43 s). Each limit is the 2026-09 baseline plus ~10%
// headroom; raising one is a deliberate decision recorded in that document.
//
//   npm run build && npm run budget
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = "dist";
const KB = 1024;

export const BUDGET = {
  /** Every script the learner app loads before it is usable, gzip. Baseline 188 KB. */
  scriptGzip: 207 * KB,
  /** Stylesheets, gzip. Baseline 5.3 KB; small enough that the limit is absolute. */
  styleGzip: 8 * KB,
  /** Everything stored for offline use, uncompressed (dominated by samples). Baseline 2.41 MB. */
  offlineCache: 2.65 * KB * KB,
  /** The file count stored for offline use. Baseline 47. */
  offlineFiles: 55,
};

function precacheFiles() {
  const source = readFileSync(join(DIST, "sw.js"), "utf8");
  const match = source.match(/^self\.PRECACHE_MANIFEST = (.+);$/m);
  if (!match) throw new Error("dist/sw.js has no precache manifest; run `npm run build` first.");
  return JSON.parse(match[1]).files;
}

export function measure() {
  const files = precacheFiles();
  const totals = { scriptGzip: 0, styleGzip: 0, offlineCache: 0, offlineFiles: files.length };
  const scripts = [];
  for (const file of files) {
    const bytes = readFileSync(join(DIST, file));
    totals.offlineCache += bytes.length;
    if (file.endsWith(".js")) {
      const gzip = gzipSync(bytes, { level: 9 }).length;
      totals.scriptGzip += gzip;
      scripts.push({ file, gzipKB: +(gzip / KB).toFixed(1), rawKB: +(bytes.length / KB).toFixed(1) });
    }
    if (file.endsWith(".css")) totals.styleGzip += gzipSync(bytes, { level: 9 }).length;
  }
  return { totals, scripts };
}

const { totals, scripts } = measure();
console.table(scripts);
const format = (name, value) =>
  name === "offlineFiles"
    ? String(value)
    : name === "offlineCache"
      ? `${(value / KB / KB).toFixed(2)} MB`
      : `${(value / KB).toFixed(1)} KB`;
let failed = false;
for (const [name, limit] of Object.entries(BUDGET)) {
  const ok = totals[name] <= limit;
  failed ||= !ok;
  console.log(
    `${ok ? "ok  " : "OVER"} ${name.padEnd(13)} ${format(name, totals[name]).padStart(9)} / ${format(name, limit)}`,
  );
}
if (failed) {
  console.error(
    "\nThe learner download is over budget. Measure with `npm run perf` and see docs/performance.md.",
  );
  process.exit(1);
}
