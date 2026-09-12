import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { CoachBridge } from "./bridge.js";
import { CoachApp } from "./CoachApp.js";
import "./coach.css";

/**
 * Mount the coach into the static page. The legacy application keeps running
 * beside it; the coach renders its practice panel into #coach-root and its
 * summary into #coach-summary, and reaches everything else through the bridge.
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
      />
    </StrictMode>,
  );
  return () => root.unmount();
}
