import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { CoachBridge } from "./bridge.js";
import { CoachApp } from "./CoachApp.js";

/**
 * Mount the React practice application into the static page. Its summary is
 * portalled into #coach-summary so it can stay above the permanent keyboard;
 * application services arrive through the bridge rather than global state.
 * Styles load with the page entry (main.js imports styles/index.css).
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
        themeContainer={doc.getElementById("coach-theme")}
        toolsContainer={doc.getElementById("coach-tools")}
        panelContainer={doc.getElementById("coach-panel-host")}
        timelineContainer={doc.getElementById("coach-timeline-slot")}
        heroControlsContainer={doc.getElementById("coach-hero-controls")}
        heroDetailContainer={doc.getElementById("coach-hero-detail")}
        focusbarContainer={doc.getElementById("coach-focusbar")}
        shellContainer={doc.querySelector<HTMLElement>(".coach-shell")}
        headerContainer={doc.querySelector<HTMLElement>(".coach-top")}
      />
    </StrictMode>,
  );
  return () => root.unmount();
}
