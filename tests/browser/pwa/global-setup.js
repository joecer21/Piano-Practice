// Builds the two "deployed versions" used by pwa-lifecycle.spec.js once, before
// any browser test starts, so the builds neither compete for CPU with running
// tests nor race each other across workers.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const PWA_BUILDS = "playwright-pwa-builds";

export default function buildPwaVersions() {
  for (const label of ["a", "b"]) {
    execFileSync(
      process.execPath,
      [
        join("node_modules", "vite", "bin", "vite.js"),
        "build",
        "--config",
        join("tests", "browser", "pwa", "build-config.js"),
        "--outDir",
        join(PWA_BUILDS, label),
        "--emptyOutDir",
      ],
      { env: { ...process.env, PWA_TEST_LABEL: label }, stdio: "pipe" },
    );
  }
}
