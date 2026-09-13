import { classifyPitch } from "../domain/score-query.js";
import { formatDegreeToken } from "../domain/describe.js";
import type { NoteRole, Score } from "../domain/score.js";
import { noteStringToMidi } from "../theory.js";
import type { Lens } from "./practice.js";

export type LabelMode = "degrees" | "letters";

export type KeyboardOverlayOptions = {
  score: Score;
  barIndex: number;
  lens: Lens;
  labelMode: LabelMode;
  /**
   * Exact keys of a chord's written voicing, for chord by chord. Drawn on the
   * shape channel so the player can copy the hand position.
   */
  shape?: readonly number[] | null;
  /** Dim every key that is not a tone of the current chord. */
  dimOutsideChord?: boolean;
};

const ROLE_TEXT: Record<NoteRole, string> = {
  root: "root",
  chordTone: "chord tone",
  scaleTone: "scale tone",
  parentScaleTone: "passing tone from the parent scale",
  chromatic: "outside the scale",
};

const OVERLAY_ATTRIBUTES = [
  "data-role",
  "data-degree",
  "data-out-of-lens",
  "data-shape",
  "data-dimmed",
] as const;

/**
 * Decorate the existing keyboard with what the current bar means.
 *
 * The keyboard itself stays the accessible, input-handling element built in
 * components/piano.js; this only adds facts to it. Channel rule: note role is
 * expressed through the data-role attribute, which CSS renders as fill weight on
 * a neutral ink mark. Hue is never used here - it is reserved for which hand is
 * sounding, which components/piano.js applies as the .lh/.rh classes.
 */
export function applyKeyboardOverlay(container: HTMLElement, options: KeyboardOverlayOptions): void {
  const { score, barIndex, lens, labelMode, shape = null, dimOutsideChord = false } = options;
  const shapeKeys = new Set(shape ?? []);
  const bar = score.bars[barIndex];
  if (!bar) {
    clearKeyboardOverlay(container);
    return;
  }
  const lensRange = lens === "both" ? null : pitchRange(score, lens);

  keysIn(container).forEach((key) => {
    const note = key.dataset.note ?? "";
    const midi = noteStringToMidi(note);
    if (!Number.isInteger(midi)) return;

    const { degree, role } = classifyPitch(score, midi, bar.startBeat);
    const inHarmony = role !== "chromatic";
    key.dataset.role = role;
    if (degree && inHarmony) key.dataset.degree = formatDegreeToken(degree);
    else delete key.dataset.degree;

    const outOfLens = lensRange != null && (midi < lensRange[0] || midi > lensRange[1]);
    if (outOfLens) key.dataset.outOfLens = "true";
    else delete key.dataset.outOfLens;

    const inShape = shapeKeys.has(midi);
    if (inShape) key.dataset.shape = "true";
    else delete key.dataset.shape;

    const dimmed = dimOutsideChord && role !== "root" && role !== "chordTone";
    if (dimmed) key.dataset.dimmed = "true";
    else delete key.dataset.dimmed;

    const labelText = !inHarmony
      ? ""
      : labelMode === "letters"
        ? stripOctave(note)
        : (key.dataset.degree ?? "");
    setLabel(key, labelText);

    const facts = inHarmony
      ? [key.dataset.degree ? `degree ${key.dataset.degree}` : null, ROLE_TEXT[role]]
      : [ROLE_TEXT[role]];
    if (inShape) facts.push("in the chord shape");
    key.setAttribute("aria-label", [`${note} piano key`, ...facts.filter(Boolean)].join(", "));
  });
}

export function clearKeyboardOverlay(container: HTMLElement): void {
  keysIn(container).forEach((key) => {
    OVERLAY_ATTRIBUTES.forEach((attribute) => key.removeAttribute(attribute));
    key.querySelector(".key-label")?.remove();
    key.setAttribute("aria-label", `${key.dataset.note ?? ""} piano key`);
  });
}

/** MIDI span a hand actually plays across the assignment, for dimming the rest. */
export function pitchRange(score: Score, part: "lh" | "rh"): readonly [number, number] | null {
  const midis = score.parts[part].flatMap((event) => (event.kind === "note" ? [event.midi] : []));
  if (!midis.length) return null;
  return [Math.min(...midis), Math.max(...midis)];
}

function keysIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".piano-key")];
}

function setLabel(key: HTMLElement, text: string): void {
  let label = key.querySelector<HTMLElement>(".key-label");
  if (!text) {
    label?.remove();
    return;
  }
  if (!label) {
    label = key.ownerDocument.createElement("span");
    label.className = "key-label";
    label.setAttribute("aria-hidden", "true");
    key.append(label);
  }
  label.textContent = text;
}

function stripOctave(note: string): string {
  return note.replace(/-?\d+$/, "");
}
