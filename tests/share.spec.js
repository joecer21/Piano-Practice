import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSIGNMENT_INPUTS,
  generateLearnerAssignment,
  normalizeAssignmentInputs,
  rerollAssignmentInputs,
} from "../domain/assignment.js";
import { createSeededRandom } from "../domain/random.js";
import {
  MAX_SHARE_LENGTH,
  decodeShareFragment,
  encodeShareFragment,
  looksLikeShareFragment,
  shareUrl,
} from "../domain/share.ts";
import { assignmentForCase, fingerprint, fingerprintCaseIds } from "./support/fingerprint.js";

const valid = () => encodeShareFragment(normalizeAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS));
const withField = (fragment, name, value) => {
  const params = new URLSearchParams(fragment);
  if (value === null) params.delete(name);
  else params.set(name, value);
  return params.toString();
};
const rejects = (fragment, pattern) => {
  const result = decodeShareFragment(fragment);
  expect(result.ok, String(fragment).slice(0, 80)).toBe(false);
  if (pattern) expect(result.error).toMatch(pattern);
};

describe("share links: round trip", () => {
  it("reproduces every fingerprinted assignment exactly: generate, encode, decode, regenerate", () => {
    for (const caseId of fingerprintCaseIds()) {
      const original = assignmentForCase(caseId);
      const fragment = encodeShareFragment(original.inputs);
      expect(fragment.length, caseId).toBeLessThan(400);
      const decoded = decodeShareFragment(`#${fragment}`);
      expect(decoded.ok, `${caseId}: ${decoded.error}`).toBe(true);
      expect(decoded.inputs, caseId).toEqual(original.inputs);
      const regenerated = generateLearnerAssignment(decoded.inputs);
      expect(regenerated.id, caseId).toBe(original.id);
      expect(fingerprint(regenerated), caseId).toBe(fingerprint(original));
    }
  });

  it("carries a preset and a custom progression, including applied chords", () => {
    const inputs = normalizeAssignmentInputs({
      ...DEFAULT_ASSIGNMENT_INPUTS,
      progressionPresetId: "custom",
      customProgressionRoman: ["I", "V/V", "bVII7", "iio7", "IVmaj7"],
      length: 5,
      presetId: "blues-a",
    });
    const decoded = decodeShareFragment(encodeShareFragment(inputs));
    expect(decoded).toEqual({ ok: true, inputs });
  });

  it("builds a full link on the page's own address, replacing any old fragment", () => {
    const url = shareUrl(
      normalizeAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS),
      "https://example.test/app/?x=1#old",
    );
    expect(url.startsWith("https://example.test/app/?x=1#v=1&key=C&mode=major")).toBe(true);
    expect(looksLikeShareFragment(new URL(url).hash)).toBe(true);
    expect(looksLikeShareFragment("")).toBe(false);
  });

  it("keeps links short however many times an assignment is rerolled", () => {
    let inputs = normalizeAssignmentInputs(DEFAULT_ASSIGNMENT_INPUTS);
    const lengths = new Set();
    for (let index = 0; index < 200; index += 1) {
      inputs = rerollAssignmentInputs(inputs);
      lengths.add(inputs.seed.length);
      expect(decodeShareFragment(encodeShareFragment(inputs)).ok).toBe(true);
    }
    expect(Math.max(...lengths)).toBeLessThanOrEqual(24);
    expect(encodeShareFragment(inputs).length).toBeLessThan(300);
  });
});

describe("share links: rejection", () => {
  it("rejects what is not a link", () => {
    rejects(undefined, /not text/);
    rejects({ v: 1 }, /not text/);
    rejects("", /no assignment/);
    rejects("#", /no assignment/);
    rejects(`v=1&seed=${"a".repeat(MAX_SHARE_LENGTH)}`, /too long/);
    rejects("v=1&key=C<script>", /unexpected characters/);
    rejects('v=1&key="C"', /unexpected characters/);
  });

  it("rejects unknown, repeated, missing and malformed fields", () => {
    rejects(`${valid()}&extra=1`, /unknown field "extra"/);
    rejects(`${valid()}&__proto__=1`, /unknown field "__proto__"/);
    rejects(`${valid()}&key=D`, /repeats "key"/);
    rejects(withField(valid(), "seed", null), /missing "seed"/);
    rejects(withField(valid(), "len", "0"), /"len" is not valid/);
    rejects(withField(valid(), "len", "99"), /length must be an integer from 1 to 32/);
    rejects(withField(valid(), "key", "H"), /"key" is not valid/);
    rejects(withField(valid(), "v", "2"), /"v" is not valid/);
    rejects(withField(valid(), "seed", "has space"), /"seed" is not valid/);
  });

  it("rejects catalog names that only exist on the prototype", () => {
    rejects(withField(valid(), "mode", "constructor"), /unknown mode/);
    rejects(withField(valid(), "motif", "constructor"), /unknown motif/);
    rejects(withField(valid(), "style", "tostring"), /unknown style/);
    rejects(withField(valid(), "preset", "constructor"), /unknown preset/);
  });

  it("rejects a motif its mode does not offer, rather than substituting one", () => {
    const fragment = withField(withField(valid(), "mode", "majorBlues"), "motif", "funk-sync");
    rejects(fragment, /isn't offered in Major Blues/);
  });

  it("rejects custom progressions that are malformed, oversized or inconsistent", () => {
    const custom = (chords, prog = "custom") => withField(withField(valid(), "prog", prog), "custom", chords);
    rejects(custom("I,VIII"), /custom progression is not valid/);
    rejects(custom("I,,V"), /custom progression is not valid/);
    rejects(custom(Array(33).fill("I").join(",")), /too long/);
    rejects(custom("I,V", "pop-4"), /does not match/);
    rejects(withField(valid(), "prog", "custom"), /does not match/);
  });

  it("never throws, and only ever accepts learner-safe inputs, across fuzzed links", () => {
    const rng = createSeededRandom("share-fuzz");
    const alphabet = "ABCDEFGabcdefg0123456789#b/,=&%.:~-_+ vkeymodprogstylehlmotiflnsdcu";
    const base = valid();
    for (let index = 0; index < 3000; index += 1) {
      let fragment;
      if (index % 3 === 0) {
        fragment = Array.from(
          { length: Math.floor(rng() * 300) },
          () => alphabet[Math.floor(rng() * alphabet.length)],
        ).join("");
      } else {
        const chars = [...base];
        for (let edits = 1 + Math.floor(rng() * 4); edits > 0; edits -= 1) {
          const at = Math.floor(rng() * chars.length);
          chars.splice(at, Math.floor(rng() * 3), alphabet[Math.floor(rng() * alphabet.length)]);
        }
        fragment = chars.join("");
      }
      let result;
      expect(() => (result = decodeShareFragment(fragment)), fragment).not.toThrow();
      if (result.ok) expect(() => generateLearnerAssignment(result.inputs), fragment).not.toThrow();
      else expect(typeof result.error, fragment).toBe("string");
    }
  });
});
