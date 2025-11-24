import { generateScale, generateProgression } from "../engine.js";
import { labelRomanWithTag, parseRomanSymbol, getChordTagForSymbol } from "../theory.js";

const preset = process.argv[2] || "pop-4";
const key = process.argv[3] || "C";
const mode = process.argv[4] || "major";

const scale = generateScale({ key, mode });
const progression = generateProgression({ key, mode, length: 4, progressionPresetId: preset }, scale, null);
const modeId = mode;

const romanLabeled = progression.roman.map((symbol, idx) => {
  const parsed = parseRomanSymbol(symbol);
  const barQuality = progression.bars?.[idx]?.quality;
  const tag = barQuality || getChordTagForSymbol(symbol, { mode: modeId, parsed, preferModeQuality: true });
  return labelRomanWithTag(symbol, tag, parsed);
});

console.log("Roman:", romanLabeled.join(" - "));
console.log("Chord labels:", progression.bars.map((bar) => bar.label).join(" | "));
