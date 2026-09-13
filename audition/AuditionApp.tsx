import { useEffect, useMemo, useState } from "react";
import { audioEngine, getSamplerStatusSnapshot, onSamplerStatus, startAudioContext } from "../audio.js";
import type {
  MusicalAuditCorpus,
  MusicalCaseReview,
  MusicalReviewLedger,
  ReviewDisposition,
} from "../audits/musical/schema.js";

type PartChoice = "both" | "lh" | "rh";
type SamplerSnapshot = {
  activeLibraryId?: string;
  libraries?: Record<string, { label?: string; phase?: string; progress?: number; error?: string | null }>;
};

const REVIEW_STORAGE_PREFIX = "piano-practice:musical-review:";
const GRANDFATHERED_NOTE_PREFIX = "Grandfathered unchanged content";
const RUBRIC = [
  "Does the melody agree with the harmony?",
  "Are accented outside-scale notes intentional?",
  "Are hand positions playable?",
  "Does the style sound recognizable?",
  "Are repetitions useful rather than mechanical?",
  "Is the assignment appropriate for the stated learner level?",
];

function activeLibrary(snapshot: SamplerSnapshot) {
  return snapshot.libraries?.[snapshot.activeLibraryId ?? ""];
}

function loadLocalLedger(corpus: MusicalAuditCorpus, fallback: MusicalReviewLedger) {
  try {
    const raw = localStorage.getItem(`${REVIEW_STORAGE_PREFIX}${corpus.corpusFingerprint}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as MusicalReviewLedger;
    return parsed.corpusFingerprint === corpus.corpusFingerprint ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function midiName(midi: number) {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function downloadLedger(ledger: MusicalReviewLedger) {
  const blob = new Blob([`${JSON.stringify(ledger, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "musical-review.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AuditionApp({
  corpus,
  initialLedger,
}: {
  corpus: MusicalAuditCorpus;
  initialLedger: MusicalReviewLedger;
}) {
  const [index, setIndex] = useState(0);
  const [part, setPart] = useState<PartChoice>("both");
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");
  const [sampler, setSampler] = useState<SamplerSnapshot>(() => getSamplerStatusSnapshot());
  const [ledger, setLedger] = useState<MusicalReviewLedger>(() => loadLocalLedger(corpus, initialLedger));
  const current = corpus.cases[index];
  const review = ledger.reviews.find((entry) => entry.caseId === current.id);

  useEffect(() => {
    const unsubscribeSampler = onSamplerStatus((event: { snapshot?: SamplerSnapshot }) => {
      setSampler(event.snapshot ?? getSamplerStatusSnapshot());
    });
    const unsubscribePlayback = audioEngine.on("status", (event) => {
      if (event.status !== "playing") setPlaying(false);
    });
    void audioEngine.init().catch((error: unknown) => {
      setMessage(`Piano loading failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      unsubscribeSampler();
      unsubscribePlayback();
      audioEngine.stopAll();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`${REVIEW_STORAGE_PREFIX}${corpus.corpusFingerprint}`, JSON.stringify(ledger));
    } catch {
      // Review still works in-memory when storage is unavailable.
    }
  }, [corpus.corpusFingerprint, ledger]);

  const counts = useMemo(
    () =>
      ledger.reviews.reduce(
        (result, entry) => ({ ...result, [entry.disposition]: result[entry.disposition] + 1 }),
        { pending: 0, approved: 0, rejected: 0 },
      ),
    [ledger.reviews],
  );
  const library = activeLibrary(sampler);
  const ready = library?.phase === "ready";

  const changeReview = (patch: Partial<MusicalCaseReview>) => {
    setLedger((previous) => ({
      ...previous,
      corpusFingerprint: corpus.corpusFingerprint,
      reviews: previous.reviews.map((entry) =>
        entry.caseId === current.id ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  const setDisposition = (disposition: Exclude<ReviewDisposition, "pending">) => {
    if (
      !review?.reviewer?.trim() ||
      !review.notes.trim() ||
      review.notes.startsWith(GRANDFATHERED_NOTE_PREFIX)
    ) {
      setMessage("Add the reviewer name and listening notes before recording a disposition.");
      return;
    }
    changeReview({
      disposition,
      reviewedAt: new Date().toISOString(),
      caseFingerprint: current.caseFingerprint,
      musicalFingerprint: current.musicalFingerprint,
      scoreFingerprint: current.scoreFingerprint,
      grandfathered: false,
    });
    setMessage(`${current.title} marked ${disposition}. Export the ledger to commit this review.`);
  };

  const markPending = () => {
    changeReview({ disposition: "pending", reviewedAt: null, grandfathered: false });
    setMessage("Disposition cleared. This case will fail the release gate until reviewed.");
  };

  const stop = () => {
    audioEngine.stopAll();
    setPlaying(false);
  };

  const play = async () => {
    if (!ready) return;
    try {
      await startAudioContext();
      audioEngine.stopAll();
      const parts = part === "both" ? (["lh", "rh"] as const) : ([part] as const);
      audioEngine.play({
        score: current.score,
        parts,
        barRange: [0, current.score.meta.bars - 1],
        rate: 1,
        loop: false,
        countIn: false,
        tempoBpm: current.tempoBpm,
      });
      setPlaying(true);
      setMessage(`Playing ${current.title}.`);
    } catch (error) {
      setMessage(`Playback failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const move = (next: number) => {
    stop();
    setIndex(Math.max(0, Math.min(corpus.cases.length - 1, next)));
    setMessage("");
  };

  return (
    <main className="audit-shell">
      <header className="audit-header">
        <div>
          <a href="./">← Piano Practice</a>
          <p className="eyebrow">Release gate · corpus {corpus.corpusFingerprint}</p>
          <h1>Musical QA audition</h1>
          <p>Listen sequentially, apply the rubric, and export the review ledger for the commit.</p>
        </div>
        <div className="audit-progress" aria-label="Review progress">
          <strong>
            {index + 1} / {corpus.cases.length}
          </strong>
          <span>{counts.approved} approved</span>
          <span>{counts.rejected} rejected</span>
          <span>{counts.pending} pending</span>
        </div>
      </header>

      <section className="audit-case" aria-labelledby="audit-case-title">
        <div className="audit-case-heading">
          <div>
            <p className="eyebrow">{current.categories.join(" · ")}</p>
            <h2 id="audit-case-title">{current.title}</h2>
            <p>{current.rationale}</p>
          </div>
          <span className={`disposition disposition-${review?.disposition ?? "missing"}`}>
            {review?.disposition ?? "missing"}
          </span>
        </div>

        <dl className="audit-facts">
          <div>
            <dt>Music</dt>
            <dd>{current.summary.keyAndCollection}</dd>
          </div>
          <div>
            <dt>Progression</dt>
            <dd>{current.summary.progression}</dd>
          </div>
          <div>
            <dt>Left hand</dt>
            <dd>{current.summary.leftHand}</dd>
          </div>
          <div>
            <dt>Motif</dt>
            <dd>{current.summary.motif}</dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd>
              <code>{current.seed}</code>
            </dd>
          </div>
          <div>
            <dt>Fingerprints</dt>
            <dd>
              <code>{current.musicalFingerprint}</code> · <code>{current.scoreFingerprint}</code>
            </dd>
          </div>
        </dl>

        <div className="audit-columns">
          <section aria-labelledby="listen-title">
            <h3 id="listen-title">Listen for</h3>
            <ul>
              {current.listenFor.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="signals-title">
            <h3 id="signals-title">Structural signals</h3>
            <ul>
              <li>
                LH{" "}
                {current.metrics.leftHandRange
                  ? current.metrics.leftHandRange.map(midiName).join("–")
                  : "none"}
                ; RH{" "}
                {current.metrics.rightHandRange
                  ? current.metrics.rightHandRange.map(midiName).join("–")
                  : "none"}
              </li>
              <li>
                Concurrent hand gap {current.metrics.closestConcurrentHandGap ?? "—"} to{" "}
                {current.metrics.widestConcurrentHandGap ?? "—"} semitones
              </li>
              <li>{current.metrics.outsideCollectionNotes.length} right-hand notes outside the collection</li>
              <li>{current.metrics.longNotes.length} notes held for at least three beats</li>
            </ul>
          </section>
        </div>

        <fieldset className="audit-playback">
          <legend>Audition</legend>
          <div className="part-choice">
            {(["both", "lh", "rh"] as const).map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name="audit-part"
                  value={choice}
                  checked={part === choice}
                  onChange={() => setPart(choice)}
                />
                {choice === "both" ? "Both hands" : choice === "lh" ? "Left only" : "Right only"}
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void play()} disabled={!ready || playing}>
            {ready ? (playing ? "Playing…" : "Play case") : `${library?.label ?? "Piano"} loading…`}
          </button>
          <button type="button" onClick={stop} disabled={!playing}>
            Stop
          </button>
        </fieldset>

        <details>
          <summary>Full listening rubric and canonical inputs</summary>
          <ul>
            {RUBRIC.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <pre>{JSON.stringify(current.inputs, null, 2)}</pre>
        </details>
      </section>

      <section className="audit-review" aria-labelledby="review-title">
        <h2 id="review-title">Listening disposition</h2>
        <div className="review-fields">
          <label>
            Reviewer
            <input
              value={review?.reviewer ?? ""}
              onChange={(event) => changeReview({ reviewer: event.target.value || null })}
              placeholder="Name or initials"
            />
          </label>
          <label>
            Reviewer notes
            <textarea
              rows={4}
              value={review?.notes ?? ""}
              onChange={(event) => changeReview({ notes: event.target.value })}
              placeholder="What convinced you, or what should change?"
            />
          </label>
        </div>
        <div className="review-actions">
          <button type="button" className="approve" onClick={() => setDisposition("approved")}>
            Approve
          </button>
          <button type="button" className="reject" onClick={() => setDisposition("rejected")}>
            Reject
          </button>
          <button type="button" onClick={markPending}>
            Clear disposition
          </button>
          <button type="button" onClick={() => downloadLedger(ledger)}>
            Export review JSON
          </button>
        </div>
      </section>

      <nav className="audit-navigation" aria-label="Audition cases">
        <button type="button" onClick={() => move(index - 1)} disabled={index === 0}>
          ← Previous
        </button>
        <select
          value={current.id}
          onChange={(event) => move(corpus.cases.findIndex((entry) => entry.id === event.target.value))}
          aria-label="Jump to audition case"
        >
          {corpus.cases.map((entry, caseIndex) => (
            <option value={entry.id} key={entry.id}>
              {caseIndex + 1}. {entry.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => move(index + 1)} disabled={index === corpus.cases.length - 1}>
          Next →
        </button>
      </nav>

      <p className="audit-status" role="status" aria-live="polite">
        {message}
      </p>
    </main>
  );
}
