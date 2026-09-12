import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCAL_SAMPLE_BASE_URL, LOCAL_VH_URL_MAP, LOCAL_VL_URL_MAP } from "../audio/local-samples.js";

const samplesDir = fileURLToPath(new URL("../public/samples/", import.meta.url));
const manifest = { low: LOCAL_VL_URL_MAP, high: LOCAL_VH_URL_MAP };

describe("local sample manifest", () => {
  it("resolves every declared URL to a real file", () => {
    for (const [layer, urls] of Object.entries(manifest)) {
      for (const [note, filename] of Object.entries(urls)) {
        expect(
          existsSync(new URL(filename, `file://${samplesDir}`)),
          `${layer} layer: ${note} -> public/samples/${filename} is missing`,
        ).toBe(true);
      }
    }
  });

  it("uses no character that a URL would reinterpret", () => {
    // "#" starts a fragment, so "samples/d#3vl.mp3" requests "samples/d".
    // The previous workaround percent-encoded it and shipped duplicate files.
    for (const urls of Object.values(manifest)) {
      for (const filename of Object.values(urls)) {
        expect(filename, `${filename} must not contain "#"`).not.toContain("#");
        expect(filename, `${filename} must not be percent-encoded`).not.toContain("%");
        expect(encodeURIComponent(filename)).toBe(filename);
      }
    }
    expect(LOCAL_SAMPLE_BASE_URL).toBe("samples/");
  });

  it("ships no sample file that nothing references", () => {
    const declared = new Set(Object.values(manifest).flatMap((urls) => Object.values(urls)));
    const orphans = readdirSync(samplesDir).filter((file) => file.endsWith(".mp3") && !declared.has(file));
    expect(orphans, `unreferenced sample files: ${orphans.join(", ")}`).toEqual([]);
  });
});
