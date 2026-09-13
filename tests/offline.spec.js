import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { nonAppFiles, precacheManifest, serviceWorkerSource } from "../scripts/offline-plugin.mjs";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
let scratch;

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

function builtDirectory(files) {
  scratch = mkdtempSync(join(tmpdir(), "piano-offline-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), content);
  }
  return scratch;
}

describe("offline precache", () => {
  it("lists every built file the app needs, and nothing it does not", () => {
    const directory = builtDirectory({
      "index.html": "<html>",
      "assets/index-abc.js": "js",
      "assets/index-abc.js.map": "map",
      "samples/a4vl.mp3": "mp3",
      "icons/icon-192.png": "png",
      "og-image.png": "preview",
      "sw.js": "old worker",
      "version.json": "{}",
    });
    expect(precacheManifest(directory).files).toEqual([
      "assets/index-abc.js",
      "icons/icon-192.png",
      "index.html",
      "samples/a4vl.mp3",
    ]);
  });

  it("leaves out maintainer pages and whatever only they reach, keeping shared chunks", () => {
    const chunk = (fileName, facade, imports = [], meta = {}) => ({
      type: "chunk",
      fileName,
      isEntry: Boolean(facade),
      facadeModuleId: facade ? `D:\\project\\${facade}` : null,
      imports,
      dynamicImports: [],
      viteMetadata: { importedCss: new Set(meta.css ?? []), importedAssets: new Set(meta.assets ?? []) },
    });
    const bundle = Object.fromEntries(
      [
        chunk("assets/main.js", "index.html", ["assets/shared.js"], { css: ["assets/main.css"] }),
        chunk("assets/audition.js", "audition.html", ["assets/shared.js", "assets/tool.js"], {
          css: ["assets/audition.css"],
          assets: ["assets/corpus.json"],
        }),
        chunk("assets/shared.js", null, [], { css: ["assets/shared.css"] }),
        chunk("assets/tool.js", null),
      ].map((item) => [item.fileName, item]),
    );
    expect([...nonAppFiles(bundle)].sort()).toEqual([
      "assets/audition.css",
      "assets/audition.js",
      "assets/corpus.json",
      "assets/tool.js",
      "audition.html",
    ]);

    const directory = builtDirectory({
      "index.html": "<html>",
      "audition.html": "<html>",
      "assets/shared.js": "js",
    });
    expect(precacheManifest(directory, { exclude: nonAppFiles(bundle) }).files).toEqual([
      "assets/shared.js",
      "index.html",
    ]);
  });

  it("refuses to build a precache without the learner entry", () => {
    expect(() => nonAppFiles({})).toThrow("index.html");
  });

  it("changes version when any cached file's contents change, and only then", () => {
    const directory = builtDirectory({ "index.html": "<html>", "samples/a4vl.mp3": "one" });
    const first = precacheManifest(directory).version;
    expect(precacheManifest(directory).version).toBe(first);
    writeFileSync(join(directory, "og-image.png"), "not cached");
    expect(precacheManifest(directory).version).toBe(first);
    writeFileSync(join(directory, "samples/a4vl.mp3"), "two");
    expect(precacheManifest(directory).version).not.toBe(first);
  });

  it("prepends the manifest to the worker source", () => {
    const source = serviceWorkerSource({ version: "v1", files: ["index.html"] });
    expect(source.startsWith('self.PRECACHE_MANIFEST = {"version":"v1","files":["index.html"]};')).toBe(true);
    expect(source).toContain('addEventListener("fetch"');
  });
});

describe("installable page metadata", () => {
  it("points the manifest at icons that exist, with relative start and scope", () => {
    const manifest = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ start_url: "./", scope: "./", display: "standalone" });
    for (const icon of manifest.icons) {
      expect(existsSync(join(publicDir, icon.src)), icon.src).toBe(true);
      expect(icon.src.startsWith("/"), `${icon.src} must be relative`).toBe(false);
    }
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("links only files that ship, relatively, and gives previews a 1200x630 image", () => {
    const hrefs = [...indexHtml.matchAll(/<link [^>]*href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of hrefs) {
      expect(href.startsWith("/"), `${href} breaks under /Piano-Practice/`).toBe(false);
      expect(existsSync(join(publicDir, href)), `public/${href}`).toBe(true);
    }

    const image = indexHtml.match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(image).toBe("https://joecer21.github.io/Piano-Practice/og-image.png");
    const png = readFileSync(join(publicDir, "og-image.png"));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
