import { useSyncExternalStore } from "react";
import type { OfflineUpdates } from "./bridge.js";

/**
 * Tells the learner a newer version is ready without ever reloading for them, so
 * a deploy cannot interrupt a practice session. The live region is always in the
 * document so assistive technology announces the message when it appears.
 */
export function UpdateNotice({ offline }: { offline: OfflineUpdates }) {
  const { update } = useSyncExternalStore(offline.subscribe, offline.getSnapshot);
  return (
    <div className="update-notice-region" role="status" aria-live="polite">
      {update === "none" ? null : (
        <div className="update-notice" data-testid="update-notice">
          <p>
            <strong>A new version of the coach is ready.</strong> Reloading keeps your assignment, and a
            session in progress can be continued from Recent practice.
          </p>
          <button
            type="button"
            className="coach-secondary"
            onClick={offline.applyUpdate}
            disabled={update === "applying"}
          >
            {update === "applying" ? "Updating…" : "Reload to update"}
          </button>
        </div>
      )}
    </div>
  );
}
