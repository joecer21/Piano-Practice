import type { PlayRequest } from "../audio/playback-engine.js";
import type { SamplerSnapshot } from "../coach/sampler.js";

export type PlaybackObservation = Pick<PlayRequest, "parts" | "barRange" | "rate" | "loop" | "countIn">;

export type RuntimeTestSurface = {
  sampler: SamplerSnapshot;
  transport: string;
  playback: PlaybackObservation | null;
};

export type RuntimeTestAdapter = {
  setSampler(snapshot: SamplerSnapshot): void;
  setTransport(state: string): void;
  setPlayback(request: PlayRequest): void;
  dispose(): void;
};

/** One explicit read-only-by-convention surface for end-to-end diagnostics. */
export function createRuntimeTestAdapter(
  browser: Window,
  initial: Pick<RuntimeTestSurface, "sampler" | "transport">,
): RuntimeTestAdapter {
  const surface: RuntimeTestSurface = { ...initial, playback: null };
  browser.__PIANO_PRACTICE_TEST__ = surface;
  return {
    setSampler(snapshot) {
      surface.sampler = snapshot;
    },
    setTransport(state) {
      surface.transport = state;
    },
    setPlayback(request) {
      surface.playback = {
        parts: request.parts,
        barRange: request.barRange,
        rate: request.rate,
        loop: request.loop,
        countIn: request.countIn,
      };
    },
    dispose() {
      if (browser.__PIANO_PRACTICE_TEST__ === surface) delete browser.__PIANO_PRACTICE_TEST__;
    },
  };
}

declare global {
  interface Window {
    __PIANO_PRACTICE_TEST__?: RuntimeTestSurface;
  }
}
