import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import corpusUrl from "../audits/musical/corpus.json?url";
import reviewsUrl from "../audits/musical/reviews.json?url";
import type { MusicalAuditCorpus, MusicalReviewLedger } from "../audits/musical/schema.js";
import { AuditionApp } from "./AuditionApp.js";
import "./style.css";

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
  return (await response.json()) as T;
}

const rootElement = document.getElementById("audit-root");
if (!rootElement) throw new Error("Musical QA root is missing");
const root = createRoot(rootElement);

Promise.all([readJson<MusicalAuditCorpus>(corpusUrl), readJson<MusicalReviewLedger>(reviewsUrl)])
  .then(([corpus, reviews]) => {
    root.render(
      <StrictMode>
        <AuditionApp corpus={corpus} initialLedger={reviews} />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(
      <main className="audit-shell">
        <h1>Musical QA could not start</h1>
        <p role="alert">{error instanceof Error ? error.message : String(error)}</p>
      </main>,
    );
  });
