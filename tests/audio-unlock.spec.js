import { describe, expect, it, vi } from "vitest";
import { AUDIO_BLOCKED_MESSAGE, createAudioUnlock } from "../application/audio-unlock.js";

describe("audio unlock", () => {
  it("surfaces a rejected start and retries on the next gesture", async () => {
    const blocked = vi.fn();
    const unlocked = vi.fn();
    const start = vi
      .fn()
      .mockRejectedValueOnce(new Error("autoplay denied"))
      .mockResolvedValueOnce(undefined);
    const unlockAudio = createAudioUnlock({ start, onBlocked: blocked, onUnlocked: unlocked });

    await expect(unlockAudio()).resolves.toBe(false);
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(blocked.mock.calls[0][0]).toMatchObject({ message: "autoplay denied" });
    expect(blocked.mock.calls[0][1]).toBe(AUDIO_BLOCKED_MESSAGE);
    expect(unlocked).not.toHaveBeenCalled();

    await expect(unlockAudio()).resolves.toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
    expect(unlocked).toHaveBeenCalledTimes(1);

    // Once unlocked, later playback does not ask the browser again.
    await expect(unlockAudio()).resolves.toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("coalesces simultaneous requests into one browser start", async () => {
    let releaseStart;
    const start = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseStart = resolve;
        }),
    );
    const unlockAudio = createAudioUnlock({ start });

    const first = unlockAudio();
    const second = unlockAudio();
    expect(start).toHaveBeenCalledTimes(1);
    releaseStart();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });
});
