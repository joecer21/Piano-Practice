export type SamplerLibraryStatus = {
  label?: string;
  phase?: string;
  progress?: number;
  error?: string | null;
};

export type SamplerSnapshot = {
  activeLibraryId: string | null;
  libraries: Record<string, SamplerLibraryStatus>;
};

export type PianoReadiness =
  | { state: "loading"; label: string; percent: number | null }
  | { state: "ready"; label: string }
  | { state: "error"; label: string; message: string };

/** Reduce the per-library sampler stream to the one fact the coach needs. */
export function pianoReadiness(snapshot: SamplerSnapshot | null | undefined): PianoReadiness {
  const library = snapshot?.activeLibraryId ? snapshot.libraries[snapshot.activeLibraryId] : undefined;
  const label = library?.label || "Piano";
  if (library?.phase === "ready") return { state: "ready", label };
  if (library?.phase === "error" || library?.phase === "timeout") {
    return { state: "error", label, message: library.error || "The piano samples could not load." };
  }
  const percent =
    typeof library?.progress === "number" && Number.isFinite(library.progress)
      ? Math.round(Math.min(1, Math.max(0, library.progress)) * 100)
      : null;
  return { state: "loading", label, percent };
}
