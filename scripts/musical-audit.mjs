import { spawnSync } from "node:child_process";

const write = process.argv.includes("--write");
const result = spawnSync("npx", ["vitest", "run", "tests/musical-audit.spec.js"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    MUSICAL_AUDIT_WRITE: write ? "1" : "0",
  },
});

if ((result.status ?? 1) === 0 && !write) {
  console.log("musical review gate: corpus and listening dispositions are current");
  console.log("audition tool: open /audition.html from npm run dev or npm run preview");
}
process.exit(result.status ?? 1);
