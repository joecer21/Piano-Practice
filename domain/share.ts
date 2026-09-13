import {
  DEFAULT_ASSIGNMENT_INPUTS,
  checkMotifOffer,
  normalizeAssignmentInputs,
  validateAssignmentInputs,
} from "./assignment.js";
import type { AssignmentInputs } from "./assignment.js";
import { getPresetConfig } from "../presets.js";

/**
 * Shareable links: an assignment's inputs, and nothing else, in the URL fragment.
 *
 *   #v=1&key=A&mode=minorBlues&prog=blues-12-minor&style=jazz&lh=root-5th-oct
 *     &motif=blues-riff-minor&len=12&seed=reroll-1x2y3z&preset=blues-a
 *
 * The engine is deterministic, so the inputs reproduce the whole assignment. The
 * fragment is never sent to a server, and the fields are readable, so a link texted
 * to yourself still says what it is.
 *
 * A link is the first genuinely untrusted input this app handles, so decoding is
 * strict and structural before any value reaches the engine: a size limit, an exact
 * set of fields each appearing once, a pattern per field, own-property catalog
 * lookups, and finally the same learner-facing checks the app applies to its own
 * controls. Anything else is rejected with a reason; decoding never throws.
 */
export const SHARE_VERSION = "1";

/** Longest fragment decoded. A real link is well under 400 characters. */
export const MAX_SHARE_LENGTH = 1024;

const MAX_CUSTOM_CHORDS = 32;

const FIELDS = {
  v: { required: true, pattern: /^1$/ },
  key: { required: true, pattern: /^[A-G](?:#|b)?$/ },
  mode: { required: true, pattern: /^[A-Za-z]{1,32}$/ },
  prog: { required: true, pattern: /^[a-z0-9-]{1,40}$/ },
  style: { required: true, pattern: /^[a-z0-9-]{1,40}$/ },
  lh: { required: true, pattern: /^[a-z0-9-]{1,40}$/ },
  motif: { required: true, pattern: /^[a-z0-9-]{1,40}$/ },
  len: { required: true, pattern: /^[1-9][0-9]?$/ },
  seed: { required: true, pattern: /^[A-Za-z0-9._:~#-]{1,128}$/ },
  preset: { required: false, pattern: /^[a-z0-9-]{1,40}$/ },
  custom: { required: false, pattern: /^[A-Za-z0-9#/,]{1,400}$/ },
} as const;

type Field = keyof typeof FIELDS;

// A progression chord as the chord palette writes it: an optional accidental, a
// numeral from I to VII, an optional quality and seventh, and an optional
// secondary target.
const ROMAN =
  /^(?:b|#)?(?:VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(?:o|dim)?(?:maj7|7)?(?:\/(?:b|#)?(?:VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i))?$/;

export type ShareDecodeResult = { ok: true; inputs: AssignmentInputs } | { ok: false; error: string };

/** The URL fragment (without "#") that reproduces these inputs. */
export function encodeShareFragment(inputs: AssignmentInputs): string {
  const normalized = normalizeAssignmentInputs(inputs);
  const params = new URLSearchParams();
  params.set("v", SHARE_VERSION);
  params.set("key", normalized.key);
  params.set("mode", normalized.mode);
  params.set("prog", normalized.progressionPresetId);
  params.set("style", normalized.styleId);
  params.set("lh", normalized.lhId);
  params.set("motif", normalized.motifId);
  params.set("len", String(normalized.length));
  params.set("seed", normalized.seed);
  if (normalized.presetId) params.set("preset", normalized.presetId);
  if (normalized.customProgressionRoman.length)
    params.set("custom", normalized.customProgressionRoman.join(","));
  return params.toString();
}

/** A complete share URL for these inputs, based on the page's own address. */
export function shareUrl(inputs: AssignmentInputs, pageUrl: string): string {
  const url = new URL(pageUrl);
  url.hash = encodeShareFragment(inputs);
  return url.toString();
}

/** Whether a fragment is meant as a share link at all (as opposed to empty). */
export function looksLikeShareFragment(fragment: string): boolean {
  return /^#?v=/.test(fragment);
}

/** Decode a fragment (with or without "#") into learner-safe assignment inputs. */
export function decodeShareFragment(fragment: unknown): ShareDecodeResult {
  if (typeof fragment !== "string") return fail("the link is not text");
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!raw) return fail("the link has no assignment in it");
  if (raw.length > MAX_SHARE_LENGTH) return fail("the link is too long");
  if (!/^[A-Za-z0-9._~%&=+-]*$/.test(raw)) return fail("the link contains unexpected characters");

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return fail("the link could not be read");
  }

  const values: Partial<Record<Field, string>> = {};
  for (const [name, value] of params) {
    if (!Object.hasOwn(FIELDS, name)) return fail(`the link has an unknown field "${truncate(name)}"`);
    const field = name as Field;
    if (values[field] !== undefined) return fail(`the link repeats "${field}"`);
    if (!FIELDS[field].pattern.test(value)) return fail(`the link's "${field}" is not valid`);
    values[field] = value;
  }
  for (const [name, spec] of Object.entries(FIELDS)) {
    if (spec.required && values[name as Field] === undefined) return fail(`the link is missing "${name}"`);
  }
  if (values.v !== SHARE_VERSION) return fail("the link is from a newer version of the app");

  const custom = values.custom ? values.custom.split(",") : [];
  if (custom.length > MAX_CUSTOM_CHORDS) return fail("the link's custom progression is too long");
  if (!custom.every((chord) => ROMAN.test(chord))) return fail("the link's custom progression is not valid");
  if ((values.prog === "custom") !== custom.length > 0) {
    return fail("the link's custom progression does not match its progression");
  }
  if (values.preset !== undefined && !getPresetConfig(values.preset))
    return fail("the link names an unknown preset");

  const candidate = {
    ...DEFAULT_ASSIGNMENT_INPUTS,
    key: values.key,
    mode: values.mode,
    progressionPresetId: values.prog,
    styleId: values.style,
    lhId: values.lh,
    motifId: values.motif,
    length: Number(values.len),
    seed: values.seed,
    presetId: values.preset ?? null,
    customProgressionRoman: custom,
  };
  const validation = validateAssignmentInputs(candidate);
  if (!validation.valid) return fail(`the link's assignment is not valid (${validation.errors[0]})`);

  const inputs = normalizeAssignmentInputs(candidate);
  const offer = checkMotifOffer(inputs);
  if (!offer.offered) return fail(offer.reason ?? "the link's motif is not offered in its mode");
  return { ok: true, inputs };
}

function fail(error: string): ShareDecodeResult {
  return { ok: false, error };
}

function truncate(value: string): string {
  return value.length > 24 ? `${value.slice(0, 24)}…` : value;
}
