import { useSyncExternalStore } from "react";
import type { StatusService } from "../application/status.js";

export function StatusLine({ status }: { status: StatusService }) {
  const snapshot = useSyncExternalStore(status.subscribe, status.getSnapshot);
  const pulseClass = snapshot.tone === "error" ? "mf-alert" : "mf-status";
  return (
    <div
      key={snapshot.revision}
      id="status-line"
      className={`status-line ${pulseClass}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-tone={snapshot.tone}
      data-transient={snapshot.transient ? "true" : "false"}
    >
      {snapshot.text}
    </div>
  );
}
