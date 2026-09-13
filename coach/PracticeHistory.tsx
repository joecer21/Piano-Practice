import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { PracticeRecord } from "../application/practice-record.js";
import type { PracticeHistory as PracticeHistoryService } from "./bridge.js";

export type HistoryAction = "resume" | "again" | "newKey" | "focus" | "faster";

type PracticeHistoryProps = {
  history: PracticeHistoryService;
  canOpen: boolean;
  expanded?: boolean;
  detailsContainer?: HTMLElement | null;
  onExpandedChange?(expanded: boolean): void;
  onAction(action: HistoryAction, record: PracticeRecord, bar?: number): void;
};

export function PracticeHistory({
  history,
  canOpen,
  expanded: controlledExpanded,
  detailsContainer = null,
  onExpandedChange,
  onAction,
}: PracticeHistoryProps) {
  const { records, recommendation, revisitAfterDays } = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
  );
  const [message, setMessage] = useState("");
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const [confirmClear, setConfirmClear] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const cancelClearRef = useRef<HTMLButtonElement>(null);
  // Where focus goes after a control that had it disappears.
  const [focusTarget, setFocusTarget] = useState<"heading" | "clear" | "cancelClear" | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    const target = { heading: headingRef, clear: clearButtonRef, cancelClear: cancelClearRef }[focusTarget]
      .current;
    (target ?? headingRef.current)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);
  const byId = (id: string) => records.find((record) => record.id === id) ?? null;
  const setExpanded = (next: boolean) => {
    if (onExpandedChange) onExpandedChange(next);
    else setLocalExpanded(next);
  };

  const actOnRecommendation = () => {
    if (!recommendation) return;
    const record = byId(recommendation.recordId);
    if (!record) return;
    if (recommendation.kind === "resume") onAction("resume", record);
    else if (recommendation.kind === "marked-bar") onAction("focus", record, recommendation.bar ?? undefined);
    else if (recommendation.kind === "new-key") onAction("newKey", record);
    else onAction("again", record);
  };

  const download = () => {
    const urlFactory = globalThis.URL;
    if (typeof urlFactory?.createObjectURL !== "function") {
      setMessage("Export is not available in this browser.");
      return;
    }
    const url = urlFactory.createObjectURL(new Blob([history.exportJson()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `piano-practice-history-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    urlFactory.revokeObjectURL(url);
    setMessage("History exported.");
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const result = history.importJson(await file.text());
    setMessage(
      result.ok
        ? `Imported ${result.imported} record${result.imported === 1 ? "" : "s"}${
            result.duplicates
              ? `; skipped ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"}`
              : ""
          }.`
        : "That file is not a valid Piano Practice history export, or it could not be saved.",
    );
    if (importInput.current) importInput.current.value = "";
  };

  return (
    <section className="practice-history" aria-labelledby="practice-history-title">
      <div className="practice-history-heading">
        <div>
          <p className="practice-history-kicker">Pick up where you left off</p>
          <h2 id="practice-history-title" ref={headingRef} tabIndex={-1}>
            Recent practice
          </h2>
        </div>
        <div className="practice-history-heading-actions">
          {records.length ? <span className="practice-history-count">{records.length} saved</span> : null}
          <button
            type="button"
            className="coach-secondary practice-history-toggle"
            data-tool-trigger="history"
            aria-expanded={expanded}
            aria-controls="practice-history-details"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide full history" : "Full history"}
          </button>
        </div>
      </div>

      {recommendation ? (
        <div className="practice-recommendation">
          <div>
            <strong>{recommendation.title}</strong>
            <p>{recommendation.reason}</p>
          </div>
          <button type="button" className="coach-primary" disabled={!canOpen} onClick={actOnRecommendation}>
            {recommendation.kind === "resume" ? "Continue" : "Practice"}
          </button>
        </div>
      ) : (
        <p className="coach-hint">
          Complete a guided session and your next practice suggestion will appear here.
        </p>
      )}

      {detailsContainer ? createPortal(historyDetails(), detailsContainer) : historyDetails()}
    </section>
  );

  function historyDetails() {
    return (
      <div
        id="practice-history-details"
        className="practice-history-details"
        hidden={!expanded}
        tabIndex={-1}
      >
        <p className="practice-history-privacy">
          Your records stay on this device. No account or network connection is used.
        </p>
        {records.length ? (
          <ul className="practice-history-list" aria-label="Practice records">
            {records.slice(0, 12).map((record) => (
              <PracticeHistoryItem
                key={record.id}
                record={record}
                history={history}
                canOpen={canOpen}
                onAction={onAction}
                onDeleted={() => {
                  setMessage("Practice record deleted.");
                  setFocusTarget("heading");
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="practice-history-empty">
            Your first guided session will be saved here automatically.
          </p>
        )}

        <details className="practice-history-overflow">
          <summary>History options</summary>
          <div className="practice-history-tools">
            <label className="practice-history-interval">
              Revisit after
              <select
                value={revisitAfterDays}
                onChange={(event) => history.setRevisitAfterDays(Number(event.target.value))}
              >
                {[1, 3, 7, 14, 30].map((days) => (
                  <option key={days} value={days}>
                    {days} day{days === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="coach-secondary" disabled={!records.length} onClick={download}>
              Export history
            </button>
            <button type="button" className="coach-secondary" onClick={() => importInput.current?.click()}>
              Import history
            </button>
            <input
              ref={importInput}
              className="practice-history-file"
              type="file"
              accept="application/json,.json"
              aria-label="Choose practice history file"
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
            {!confirmClear ? (
              <button
                ref={clearButtonRef}
                type="button"
                className="coach-link"
                disabled={!records.length || !canOpen}
                onClick={() => {
                  setConfirmClear(true);
                  setFocusTarget("cancelClear");
                }}
              >
                Clear history
              </button>
            ) : (
              <span className="practice-history-confirm">
                Clear practice records only?
                <button
                  type="button"
                  className="coach-secondary"
                  disabled={!canOpen}
                  onClick={() => {
                    history.clear();
                    setConfirmClear(false);
                    setMessage("Practice history cleared. Your settings and starred assignments were kept.");
                    setFocusTarget("heading");
                  }}
                >
                  Yes, clear
                </button>
                <button
                  ref={cancelClearRef}
                  type="button"
                  className="coach-link"
                  onClick={() => {
                    setConfirmClear(false);
                    setFocusTarget("clear");
                  }}
                >
                  Cancel
                </button>
              </span>
            )}
            <span className="coach-library-status" role="status">
              {message}
            </span>
          </div>
        </details>
      </div>
    );
  }
}

function PracticeHistoryItem({
  record,
  history,
  canOpen,
  onAction,
  onDeleted,
}: {
  record: PracticeRecord;
  history: PracticeHistoryService;
  canOpen: boolean;
  onAction(action: HistoryAction, record: PracticeRecord, bar?: number): void;
  onDeleted(): void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState("");
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const [focusTarget, setFocusTarget] = useState<"delete" | "cancelDelete" | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    (focusTarget === "delete" ? deleteButtonRef : cancelDeleteRef).current?.focus();
    setFocusTarget(null);
  }, [focusTarget]);
  const [label, setLabel] = useState(record.label ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [bars, setBars] = useState(record.needsWorkBars.join(", "));
  const saveNotes = () => {
    history.annotate(record.id, { label, notes, needsWorkBars: parseBars(bars) });
    setSaved("Notes saved.");
  };
  const duration = formatDuration(record.activeDurationMs);
  const date = new Date(record.startedAt);
  const status =
    record.status === "completed"
      ? "Completed"
      : record.status === "abandoned"
        ? "Ended early"
        : "Incomplete";

  return (
    <li className="practice-history-item">
      <details>
        <summary>
          <span className="practice-history-title">{record.label || record.assignment.title}</span>
          <span className={`practice-history-status practice-history-status-${record.status}`}>{status}</span>
          <time dateTime={record.startedAt}>{date.toLocaleDateString()}</time>
          <span>{duration}</span>
        </summary>
        <div className="practice-history-body">
          {record.label ? <p className="coach-hint">{record.assignment.title}</p> : null}
          <p className="practice-history-meta">
            Tempo {record.startingTempo}
            {record.endingTempo !== record.startingTempo ? ` → ${record.endingTempo}` : ""} BPM
            {record.handsPractised.length ? ` · ${record.handsPractised.join(" + ")} hand` : ""}
            {record.barsVisited.length ? ` · Bars ${record.barsVisited.join(", ")}` : ""}
          </p>
          <div className="coach-session practice-history-actions">
            {record.status === "incomplete" ? (
              <button
                type="button"
                className="coach-primary"
                disabled={!canOpen}
                onClick={() => onAction("resume", record)}
              >
                Continue
              </button>
            ) : null}
            <button
              type="button"
              className="coach-secondary"
              disabled={!canOpen}
              onClick={() => onAction("again", record)}
            >
              Practice this again
            </button>
            <button
              type="button"
              className="coach-secondary"
              disabled={!canOpen}
              onClick={() => onAction("newKey", record)}
            >
              Repeat in a new key
            </button>
            <button
              type="button"
              className="coach-secondary"
              disabled={!canOpen}
              onClick={() => onAction("faster", record)}
            >
              Again +5 BPM
            </button>
            {record.needsWorkBars.length ? (
              <button
                type="button"
                className="coach-secondary"
                disabled={!canOpen}
                onClick={() => onAction("focus", record, record.needsWorkBars[0])}
              >
                Focus on marked bars
              </button>
            ) : null}
          </div>
          <div className="practice-history-notes">
            <label>
              Short label
              <input maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label>
              Needs-work bars
              <input
                inputMode="numeric"
                placeholder="2, 4"
                value={bars}
                onChange={(event) => setBars(event.target.value)}
              />
            </label>
            <label className="practice-history-notes-wide">
              Session notes
              <textarea
                maxLength={2000}
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <button type="button" className="coach-secondary" onClick={saveNotes}>
              Save notes
            </button>
            <span className="coach-library-status" role="status">
              {saved}
            </span>
          </div>
          {!confirmDelete ? (
            <button
              ref={deleteButtonRef}
              type="button"
              className="coach-link"
              disabled={!canOpen}
              onClick={() => {
                setConfirmDelete(true);
                setFocusTarget("cancelDelete");
              }}
            >
              Delete this record
            </button>
          ) : (
            <span className="practice-history-confirm">
              Delete this record permanently?
              <button
                type="button"
                className="coach-secondary"
                disabled={!canOpen}
                onClick={() => {
                  history.delete(record.id);
                  onDeleted();
                }}
              >
                Yes, delete
              </button>
              <button
                ref={cancelDeleteRef}
                type="button"
                className="coach-link"
                onClick={() => {
                  setConfirmDelete(false);
                  setFocusTarget("delete");
                }}
              >
                Cancel
              </button>
            </span>
          )}
        </div>
      </details>
    </li>
  );
}

function parseBars(value: string): number[] {
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map(Number)
        .filter((bar) => Number.isInteger(bar) && bar >= 1 && bar <= 128),
    ),
  ].sort((a, b) => a - b);
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
