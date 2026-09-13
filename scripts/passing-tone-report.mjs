// Outside-collection note report. The report reads Score, which is TypeScript that
// Node cannot load directly, so it lives in tests/passing-tone-report.spec.js and
// runs under Vitest.
//   node scripts/passing-tone-report.mjs   # -> test-results/passing-tones.md
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../test-results/passing-tones.md", import.meta.url));
const result = spawnSync("npx", ["vitest", "run", "tests/passing-tone-report.spec.js"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PASSING_TONE_REPORT: out },
});
if (result.status === 0) console.log(`wrote ${out}`);
process.exit(result.status ?? 1);
