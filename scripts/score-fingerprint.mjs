// Score fingerprint runner. Score is TypeScript that Node cannot load directly, so
// the check lives in tests/score-fingerprint.spec.js and runs under Vitest.
//   node scripts/score-fingerprint.mjs            # verify against the frozen baseline
//   node scripts/score-fingerprint.mjs --write    # re-freeze baseline + curated fixtures
import { spawnSync } from "node:child_process";

const write = process.argv.includes("--write");
const result = spawnSync("npx", ["vitest", "run", "tests/score-fingerprint.spec.js"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...(write ? { FINGERPRINT_WRITE: "score" } : {}) },
});
process.exit(result.status ?? 1);
