export const AUDIO_BLOCKED_MESSAGE =
  "Sound is blocked by the browser. Click anywhere on the page to enable audio.";

/**
 * Create a retryable, single-flight Web Audio unlock operation.
 *
 * Keeping this boundary independent of Tone and the DOM makes the browser's
 * rejection path testable. A failed attempt is deliberately not cached: the
 * next user gesture must be allowed to try again.
 *
 * @param {{
 *   start: () => Promise<void>,
 *   onBlocked?: (error: unknown, message: string) => void,
 *   onUnlocked?: () => void,
 * }} options
 */
export function createAudioUnlock({ start, onBlocked = () => {}, onUnlocked = () => {} }) {
  if (typeof start !== "function") {
    throw new TypeError("createAudioUnlock requires a start function");
  }

  let unlocked = false;
  let pending = null;

  return async function unlockAudio() {
    if (unlocked) return true;
    if (pending) return pending;

    pending = (async () => {
      try {
        await start();
        unlocked = true;
        onUnlocked();
        return true;
      } catch (error) {
        onBlocked(error, AUDIO_BLOCKED_MESSAGE);
        return false;
      } finally {
        pending = null;
      }
    })();

    return pending;
  };
}
