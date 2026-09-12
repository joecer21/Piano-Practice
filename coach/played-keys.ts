import type { PlayedState } from "../input/held-notes.js";
import { noteStringToMidi } from "../theory.js";

export type OffKeyboard = { below: number; above: number };

/**
 * Mirror what the player is sounding onto the keyboard.
 *
 * Channel rule: this is the ring channel. A played key gets data-played="held" or
 * "sustained", which CSS draws as a neutral ring. It never touches .lh/.rh, so the
 * player's own notes cannot be mistaken for a hand of the assignment sounding.
 *
 * Returns how many played notes fall outside the keys on screen, so a phone
 * showing two octaves can still say that something was played out of view.
 */
export function applyPlayedKeys(
  container: HTMLElement,
  played: ReadonlyMap<number, PlayedState>,
): OffKeyboard {
  const keys = [...container.querySelectorAll<HTMLElement>(".piano-key")];
  let lowest = Infinity;
  let highest = -Infinity;

  keys.forEach((key) => {
    const midi = noteStringToMidi(key.dataset.note ?? "");
    if (!Number.isInteger(midi)) return;
    lowest = Math.min(lowest, midi);
    highest = Math.max(highest, midi);
    const state = played.get(midi);
    if (state) {
      if (key.dataset.played !== state) key.dataset.played = state;
    } else if (key.dataset.played) {
      delete key.dataset.played;
    }
  });

  const off: OffKeyboard = { below: 0, above: 0 };
  if (!keys.length) return off;
  played.forEach((_state, midi) => {
    if (midi < lowest) off.below += 1;
    else if (midi > highest) off.above += 1;
  });
  return off;
}
