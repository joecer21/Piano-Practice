// @ts-check

/**
 * Convert any supported seed into a stable, non-empty string.
 * @param {string | number | bigint | null | undefined} seed
 * @returns {string}
 */
export function normalizeSeed(seed) {
  if (typeof seed === "bigint") return seed.toString(10);
  const normalized = String(seed ?? "piano-practice").trim();
  return normalized || "piano-practice";
}

/**
 * Small deterministic PRNG suitable for reproducible musical choices.
 * It is intentionally not cryptographically secure.
 * @param {string | number | bigint} seed
 * @returns {() => number}
 */
export function createSeededRandom(seed) {
  let state = hashString(normalizeSeed(seed)) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {readonly T[]} values
 * @param {() => number} rng
 * @returns {T | undefined}
 */
export function pickSeeded(values, rng) {
  if (!values.length) return undefined;
  const index = Math.min(values.length - 1, Math.floor(rng() * values.length));
  return values[index];
}

/**
 * Derive an independent child seed without consuming a PRNG stream.
 *
 * Fixed length, whatever the parent: the child used to embed its parent, so every
 * reroll grew the seed and a well-practised assignment's share link grew without
 * bound. Two 32-bit hashes keep chains from colliding in practice.
 * @param {string | number | bigint} seed
 * @param {string} namespace
 * @returns {string}
 */
export function deriveSeed(seed, namespace) {
  const source = `${normalizeSeed(seed)}:${namespace}`;
  return `${namespace}-${hashString(source).toString(36)}${hashString(`${source}#`).toString(36)}`;
}

/** @param {string} value */
export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
