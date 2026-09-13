import { useId, useRef, useState, useSyncExternalStore } from "react";
import type { CoachLibrary } from "./bridge.js";

type LibraryControlsProps = {
  library: CoachLibrary;
  /** Starred assignments can be reopened only between sessions. */
  canOpen: boolean;
  onOpened?: () => void;
};

type ShareState =
  { kind: "idle" } | { kind: "copied" } | { kind: "shared" } | { kind: "manual"; url: string };

/**
 * Come back to the same assignment: star it, send yourself the link, reopen it
 * tomorrow. Everything stays in this browser; a link carries only the assignment.
 */
export function LibraryControls({ library, canOpen, onOpened }: LibraryControlsProps) {
  const snapshot = useSyncExternalStore(library.subscribe, library.getSnapshot);
  const [share, setShare] = useState<ShareState>({ kind: "idle" });
  const [openError, setOpenError] = useState<string | null>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  const linkId = useId();

  const shareLink = async () => {
    const url = library.currentShareUrl();
    if (!url) return;
    const title = library.currentTitle() ?? "Piano practice";
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        setShare({ kind: "shared" });
        return;
      } catch (error) {
        // Dismissing the share sheet is not an error worth reporting.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShare({ kind: "copied" });
    } catch {
      setShare({ kind: "manual", url });
      requestAnimationFrame(() => manualInput.current?.select());
    }
  };

  const open = (fragment: string) => {
    if (library.open(fragment)) {
      setOpenError(null);
      onOpened?.();
    } else {
      setOpenError("That starred assignment could not be opened.");
    }
  };

  const count = snapshot.starred.length;
  return (
    <div className="coach-library">
      <div className="coach-session">
        <button
          type="button"
          className="coach-secondary"
          aria-pressed={snapshot.currentStarred}
          onClick={() => library.toggleStarCurrent()}
        >
          {snapshot.currentStarred ? "★ Starred" : "☆ Star"}
        </button>
        <button type="button" className="coach-secondary" onClick={() => void shareLink()}>
          Share link
        </button>
        <span className="coach-library-status" role="status">
          {share.kind === "copied" ? "Link copied." : share.kind === "shared" ? "Shared." : ""}
        </span>
      </div>

      {share.kind === "manual" ? (
        <p className="coach-library-manual">
          <label htmlFor={linkId}>Copy this link:</label>{" "}
          <input
            id={linkId}
            ref={manualInput}
            readOnly
            value={share.url}
            onFocus={(event) => event.target.select()}
          />
        </p>
      ) : null}

      {count > 0 ? (
        <details className="coach-more coach-starred">
          <summary>Starred ({count})</summary>
          <ul className="coach-starred-list" aria-label="Starred assignments">
            {snapshot.starred.map((entry) => (
              <li key={entry.fragment} className="coach-starred-item">
                <span className="coach-starred-title">{entry.title}</span>{" "}
                <time className="coach-starred-date" dateTime={entry.starredAt}>
                  {new Date(entry.starredAt).toLocaleDateString()}
                </time>
                <span className="coach-session">
                  <button
                    type="button"
                    className="coach-secondary"
                    disabled={!canOpen}
                    aria-label={`Open ${entry.title}`}
                    onClick={() => open(entry.fragment)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="coach-link"
                    aria-label={`Remove ${entry.title} from starred`}
                    onClick={() => library.unstar(entry.fragment)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {!canOpen ? (
            <p className="coach-hint">Finish or end the session to open another assignment.</p>
          ) : null}
          {openError ? (
            <p className="coach-hint" role="alert">
              {openError}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
