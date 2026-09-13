import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { CoachBridge } from "./bridge.js";
import { CoachApp } from "./CoachApp.js";
import "./coach.css";

/**
 * Mount the React practice application into the static page. Its summary is
 * portalled into #coach-summary so it can stay above the permanent keyboard;
 * application services arrive through the bridge rather than global state.
 */
export function mountCoach(bridge: CoachBridge, doc: Document = document): () => void {
  const rootElement = doc.getElementById("coach-root");
  if (!rootElement) return () => {};
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <CoachApp
        bridge={bridge}
        summaryContainer={doc.getElementById("coach-summary")}
        inputContainer={doc.getElementById("coach-input")}
        settingsContainer={doc.getElementById("coach-settings")}
      />
    </StrictMode>,
  );
  return () => root.unmount();
}
