// Outside-collection note review. The report reads Score, which is TypeScript that
// Node cannot load directly, so it lives in tests/outside-collection-report.spec.js
// and runs under Vitest.
//   node scripts/outside-collection-report.mjs   # -> test-results/outside-collection-notes.md
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../test-results/outside-collection-notes.md", import.meta.url));
const result = spawnSync("npx", ["vitest", "run", "tests/outside-collection-report.spec.js"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, OUTSIDE_COLLECTION_REPORT: out },
});
if (result.status === 0) console.log(`wrote ${out}`);
process.exit(result.status ?? 1);
