// Vite build plugin: writes dist/sw.js with the precache manifest for offline use.
// The service worker's logic lives in offline/service-worker.js; this only lists
// what the finished build contains and versions it by content.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_SOURCE = fileURLToPath(new URL("../offline/service-worker.js", import.meta.url));
export const SERVICE_WORKER_FILE = "sw.js";

/** Files the app never needs offline: source maps, the worker itself, the link-preview image. */
const EXCLUDED = [/\.map$/, /^sw\.js$/, /^og-image\.png$/];

/** Every file under a directory, as forward-slash paths relative to it, sorted. */
export function listFiles(directory) {
  const walk = (current) =>
    readdirSync(current).flatMap((name) => {
      const path = join(current, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(directory, path).split(sep).join("/")];
    });
  return walk(directory).sort();
}

/**
 * The precache manifest for a built directory: the files to cache and a version
 * derived from their names and contents, so any change produces a new cache.
 */
export function precacheManifest(directory) {
  const files = listFiles(directory).filter((file) => !EXCLUDED.some((pattern) => pattern.test(file)));
  const hash = createHash("sha256");
  for (const file of files) {
    hash
      .update(file)
      .update("\0")
      .update(readFileSync(join(directory, file)))
      .update("\0");
  }
  return { version: hash.digest("hex").slice(0, 16), files };
}

export function serviceWorkerSource(manifest) {
  return `self.PRECACHE_MANIFEST = ${JSON.stringify(manifest)};\n\n${readFileSync(WORKER_SOURCE, "utf8")}`;
}

export function offlinePlugin() {
  let outDir;
  return {
    name: "piano-practice-offline",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const manifest = precacheManifest(outDir);
      writeFileSync(join(outDir, SERVICE_WORKER_FILE), serviceWorkerSource(manifest));
      this.info?.(`precached ${manifest.files.length} files for offline use (version ${manifest.version})`);
    },
  };
}
