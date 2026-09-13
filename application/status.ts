export type StatusTone = "neutral" | "hint" | "success" | "error" | "info";

export type StatusSnapshot = {
  text: string;
  tone: StatusTone;
  transient: boolean;
  revision: number;
};

export type StatusOptions = {
  tone?: StatusTone;
  transient?: boolean;
  duration?: number;
  ambient?: boolean;
  pulse?: boolean;
};

export type StatusService = {
  getSnapshot(): StatusSnapshot;
  subscribe(listener: () => void): () => void;
  show(text: string, options?: StatusOptions): void;
  hint(text: string, options?: Omit<StatusOptions, "tone" | "transient">): void;
  dispose(): void;
};

const DEFAULT_TRANSIENT_MS = 4200;

/** One priority-aware application status channel, rendered by React. */
export function createStatusService(): StatusService {
  const listeners = new Set<() => void>();
  let persistent: Pick<StatusSnapshot, "text" | "tone"> = { text: "", tone: "neutral" };
  let snapshot: StatusSnapshot = { ...persistent, transient: false, revision: 0 };
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const publish = (next: Omit<StatusSnapshot, "revision">, pulse = true) => {
    snapshot = { ...next, revision: snapshot.revision + (pulse ? 1 : 0) };
    listeners.forEach((listener) => listener());
  };

  const clearReset = () => {
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = null;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show(text, options = {}) {
      const {
        tone = "neutral",
        transient = false,
        duration = DEFAULT_TRANSIENT_MS,
        ambient = false,
        pulse = true,
      } = options;
      if (!transient) {
        persistent = { text, tone };
        if (ambient && resetTimer !== null) return;
      }

      clearReset();
      publish({ text, tone, transient }, pulse);
      if (!transient) return;
      resetTimer = setTimeout(
        () => {
          resetTimer = null;
          publish({ ...persistent, transient: false }, false);
        },
        Number.isFinite(duration) ? duration : DEFAULT_TRANSIENT_MS,
      );
    },
    hint(text, options = {}) {
      this.show(text, { ...options, tone: "hint", transient: true });
    },
    dispose() {
      clearReset();
      listeners.clear();
    },
  };
}
