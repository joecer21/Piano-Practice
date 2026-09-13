// Vite build plugin: writes dist/sw.js with the precache manifest for offline use.
// The service worker's logic lives in offline/service-worker.js; this only lists
// what the finished learner app contains and versions it by content.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_SOURCE = fileURLToPath(new URL("../offline/service-worker.js", import.meta.url));
export const SERVICE_WORKER_FILE = "sw.js";
/** Identifies a deployed build: release version, source commit and offline cache version. */
export const BUILD_INFO_FILE = "version.json";
/** The HTML entry learners open. Other HTML entries are maintainer tools. */
export const APP_ENTRY = "index.html";

/**
 * Files the app never needs offline: source maps, the worker itself, the build
 * stamp (so a commit that changes nothing shipped does not invalidate the cache)
 * and the link-preview image.
 */
const EXCLUDED = [/\.map$/, /^sw\.js$/, /^version\.json$/, /^og-image\.png$/];

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
 * The files that belong only to HTML entries other than the learner app: those
 * pages, and every chunk, stylesheet and imported asset reachable from them but
 * not from the app. `bundle` is Rollup/Rolldown's output bundle.
 */
export function nonAppFiles(bundle) {
  const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const reachable = (entry) => {
    const seen = new Set();
    const visit = (fileName) => {
      if (seen.has(fileName)) return;
      seen.add(fileName);
      const chunk = byFile.get(fileName);
      if (!chunk) return;
      [...chunk.imports, ...chunk.dynamicImports].forEach(visit);
      for (const file of chunk.viteMetadata?.importedCss ?? []) seen.add(file);
      for (const file of chunk.viteMetadata?.importedAssets ?? []) seen.add(file);
    };
    visit(entry.fileName);
    return seen;
  };
  const htmlEntry = (chunk) => chunk.facadeModuleId?.replaceAll("\\", "/").split("/").pop();
  const entries = chunks.filter((chunk) => chunk.isEntry && htmlEntry(chunk)?.endsWith(".html"));
  const app = entries.find((chunk) => htmlEntry(chunk) === APP_ENTRY);
  if (!app) throw new Error(`The offline precache could not find the ${APP_ENTRY} entry in the bundle.`);

  const appFiles = reachable(app);
  const excluded = new Set();
  for (const entry of entries) {
    if (entry === app) continue;
    excluded.add(htmlEntry(entry));
    for (const file of reachable(entry)) if (!appFiles.has(file)) excluded.add(file);
  }
  return excluded;
}

/**
 * The precache manifest for a built directory: the files to cache and a version
 * derived from their names and contents, so any change produces a new cache.
 */
export function precacheManifest(directory, { exclude = new Set() } = {}) {
  const files = listFiles(directory).filter(
    (file) => !exclude.has(file) && !EXCLUDED.some((pattern) => pattern.test(file)),
  );
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

/** The build stamp written beside the worker. */
export function buildInfo(manifest, { env = process.env, cwd = process.cwd() } = {}) {
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  let commit = env.GITHUB_SHA ?? null;
  if (!commit) {
    try {
      commit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      commit = null;
    }
  }
  return { version: pkg.version ?? null, commit, cacheVersion: manifest.version };
}

export function offlinePlugin() {
  let outDir;
  let exclude = new Set();
  return {
    name: "piano-practice-offline",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      exclude = nonAppFiles(bundle);
    },
    closeBundle() {
      const manifest = precacheManifest(outDir, { exclude });
      writeFileSync(join(outDir, SERVICE_WORKER_FILE), serviceWorkerSource(manifest));
      writeFileSync(join(outDir, BUILD_INFO_FILE), `${JSON.stringify(buildInfo(manifest), null, 2)}\n`);
      this.info?.(`precached ${manifest.files.length} files for offline use (version ${manifest.version})`);
    },
  };
}
