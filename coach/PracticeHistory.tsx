import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PracticeRecord } from "../application/practice-record.js";
import type { PracticeHistory as PracticeHistoryService } from "./bridge.js";
import { recordNames } from "./feel.js";
import { Icon } from "./Icon.js";
import { SESSION_STEPS } from "./session.js";

export type HistoryAction = "resume" | "again" | "newKey" | "focus" | "faster";

type PracticeHistoryProps = {
  history: PracticeHistoryService;
  canOpen: boolean;
  onAction(action: HistoryAction, record: PracticeRecord, bar?: number): void;
};

/**
 * Recent practice on the Stage: a pick-up card for gentle continuity, and the full
 * list opened in place. It is one section with one heading, so focus returned
 * after a delete or clear always lands somewhere visible.
 */
export function PracticeHistory({ history, canOpen, onAction }: PracticeHistoryProps) {
  const { records, recommendation, revisitAfterDays } = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
  );
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
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
        <h2 id="practice-history-title" ref={headingRef} tabIndex={-1}>
          Recent practice
        </h2>
        {records.length ? <span className="practice-history-count">{records.length} saved</span> : null}
        <button
          type="button"
          className="coach-link practice-history-toggle"
          aria-expanded={expanded}
          aria-controls="practice-history-details"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Full history"}
        </button>
        <details className="practice-history-overflow">
          <summary aria-label="History options">
            <Icon name="more" />
          </summary>
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
            <button type="button" className="coach-menu-item" disabled={!records.length} onClick={download}>
              Export history
            </button>
            <button type="button" className="coach-menu-item" onClick={() => importInput.current?.click()}>
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
                className="coach-menu-item"
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
          </div>
        </details>
      </div>

      <div className="practice-pickup">
        {recommendation?.kind === "resume" ? (
          <PickCard
            eyebrow="Pick up where you left off"
            record={byId(recommendation.recordId)}
            recommendation={recommendation}
            action="Continue"
            canOpen={canOpen}
            onClick={actOnRecommendation}
          />
        ) : records[0] && records[0].id !== recommendation?.recordId ? (
          <PickCard
            eyebrow="Pick up where you left off"
            record={records[0]}
            action="Play it again"
            canOpen={canOpen}
            onClick={() => onAction("again", records[0])}
          />
        ) : (
          <div className="practice-pick">
            <p className="coach-eyebrow">Pick up where you left off</p>
            <p>Complete a guided session and your next practice suggestion will appear here.</p>
          </div>
        )}
        {recommendation && recommendation.kind !== "resume" ? (
          <PickCard
            eyebrow="Try next"
            record={byId(recommendation.recordId)}
            recommendation={recommendation}
            action="Practice"
            canOpen={canOpen}
            onClick={actOnRecommendation}
          />
        ) : null}
      </div>

      <p className="coach-library-status practice-history-message" role="status">
        {message}
      </p>

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
      </div>
    </section>
  );
}

type Recommendation = NonNullable<ReturnType<PracticeHistoryService["getSnapshot"]>["recommendation"]>;

/** One pick-up card: the assignment by feel, where it stands, and one way back in. */
function PickCard({
  eyebrow,
  record,
  recommendation,
  action,
  canOpen,
  onClick,
}: {
  eyebrow: string;
  record: PracticeRecord | null;
  recommendation?: Recommendation;
  action: string;
  canOpen: boolean;
  onClick(): void;
}) {
  const names = record ? recordNames(record) : null;
  return (
    <div className={`practice-pick${recommendation ? " practice-recommendation" : ""}`}>
      <p className="coach-eyebrow">{eyebrow}</p>
      <p className="practice-pick-name">
        {names?.feel ? `${names.feel}.` : (recommendation?.title ?? names?.title)}
      </p>
      {record && names ? (
        <p>
          {record.label || names.title} · {formatWhen(record.startedAt).toLowerCase()}, {progressText(record)}
        </p>
      ) : null}
      {recommendation ? (
        <p>
          {recommendation.title}. {recommendation.reason}
        </p>
      ) : null}
      <button type="button" className="coach-secondary" disabled={!canOpen} onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

/** How far a session got, in steps: never how well. */
function progressText(record: PracticeRecord): string {
  const reached = SESSION_STEPS.filter((step) => record.learningLenses.includes(step.id));
  if (record.status === "completed") return "played all the way through";
  const last = reached.at(-1);
  return last ? `stopped at ${last.title.toLowerCase()}` : "stopped early";
}

/** "Today 8:14", "Yesterday 21:40", "Thu 11 Sep". */
function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

/** A small copy of the session rail: which steps were reached, never how well. */
function MiniRail({ record }: { record: PracticeRecord }) {
  return (
    <span className="practice-mini-rail" aria-hidden="true">
      {SESSION_STEPS.map((step) => (
        <i
          key={step.id}
          style={{ flexGrow: step.weight }}
          data-on={record.learningLenses.includes(step.id) || undefined}
        />
      ))}
    </span>
  );
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
  // A note saved from the session summary (or another tab) replaces a stale draft.
  const persisted = JSON.stringify([record.label, record.notes, record.needsWorkBars]);
  const [syncedFrom, setSyncedFrom] = useState(persisted);
  if (syncedFrom !== persisted) {
    setSyncedFrom(persisted);
    setLabel(record.label ?? "");
    setNotes(record.notes ?? "");
    setBars(record.needsWorkBars.join(", "));
  }
  const saveNotes = () => {
    history.annotate(record.id, { label, notes, needsWorkBars: parseBars(bars) });
    setSaved("Notes saved.");
  };
  const duration = formatDuration(record.activeDurationMs);
  const names = recordNames(record);
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
          <time dateTime={record.startedAt}>{formatWhen(record.startedAt)}</time>
          <span className="practice-history-main">
            <span className="practice-history-title">{record.label || names.title}</span>
            <span className="practice-history-line">
              <span className={`practice-history-status practice-history-status-${record.status}`}>
                {status}
              </span>{" "}
              · {progressText(record)} · {duration}
            </span>
            <MiniRail record={record} />
            {record.notes ? <span className="practice-history-note">{record.notes}</span> : null}
          </span>
        </summary>
        <div className="practice-history-body">
          {record.label ? <p className="coach-hint">{names.title}</p> : null}
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
