# Performance

Measure before changing anything, and change only what the measurements implicate.

## How to measure

```bash
npm run build
npm run perf                 # median of 5 runs per profile
npm run perf -- --runs 9 --json test-results/perf.json
npm run perf -- --url http://127.0.0.1:4181/   # an already-running build, e.g. a baseline worktree
npm run budget               # the CI size gate
```

`scripts/measure-performance.mjs` drives the production build in Chromium with two profiles: **desktop** (unthrottled) and **phone** (Pixel 7 viewport, 4× CPU slowdown, DevTools "Slow 4G": 150 ms RTT, 1.6 Mbps down). Each run is a fresh browser context.

| Milestone    | Meaning                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| sentence     | The assignment sentence has rendered: React mounted and the first assignment was generated.                    |
| piano ready  | _Start 5 minutes_ is enabled: the default samples are downloaded and decoded. The first moment music can play. |
| JS eval      | CDP `ScriptDuration` up to piano ready.                                                                        |
| open editor  | From clicking _Change the assignment_ until _Apply assignment_ is visible.                                     |
| SW controls  | A service worker has installed and controls the page (second context).                                         |
| cached ready | Piano ready again after a reload served by the service worker.                                                 |

Cold-load milestones run with service workers blocked. DevTools network throttling applies to the page but not to a worker, so an unthrottled worker would otherwise fill the HTTP cache and make the page's own downloads look free. For the same reason **SW controls is not representative of a real phone** — on a real connection the worker and the page share one network.

## Results, 2026-09-13

Median of 5 runs. "Before" is commit `7234f23`; "after" is the Slice 14 working tree.

| Profile | Milestone       | Before  | After   |
| ------- | --------------- | ------- | ------- |
| phone   | sentence        | 2059 ms | 2090 ms |
| phone   | **piano ready** | 9386 ms | 6200 ms |
| phone   | JS eval         | 467 ms  | 460 ms  |
| phone   | open editor     | 122 ms  | 120 ms  |
| phone   | cached ready    | 872 ms  | 804 ms  |
| desktop | sentence        | 168 ms  | 188 ms  |
| desktop | piano ready     | 302 ms  | 256 ms  |
| desktop | cached ready    | 224 ms  | 204 ms  |

Transferred before piano ready: 191 KB of script (gzip), 6 KB of CSS, 903 KB of samples.

## What the measurements showed, and what changed

**Samples, not JavaScript, dominated the first playable moment.** On the phone profile the sentence appeared after about 2.1 s, but the piano was not ready for another 7 s. Request tracing showed each of the 16 default samples requested three times before ready: once by a progress pre-fetch that discarded the bytes, then once per part sampler, each of which decoded its own copy. `audio.js` now downloads each sample once, with up to six in parallel, decodes it once, and hands the decoded `AudioBuffer`s to every part's sampler. **Piano ready on the phone profile improved from 9.4 s to 6.2 s**, with fewer decodes and half the decoded audio in memory. `tests/audio-lifecycle.spec.js` pins one request per sample.

**The offline cache downloaded a maintainer tool.** The precache included the musical QA audition page and its 1.9 MB review corpus. It now contains only what the learner app reaches (47 files, 2.41 MB, almost all piano samples).

**Offline install no longer re-downloads what the page just fetched.** The worker installs with `cache: "no-cache"`: each file is revalidated, so a new version never stores a stale copy, but unchanged files return as `304 Not Modified`.

**JavaScript was not lazy-loaded.** The bundler warning concerned about 660 KB of uncompressed script. Measured, the whole learner bundle is 188 KB gzip and costs about 0.46 s of evaluation on a 4× slowed CPU; the sentence appears at about 2.1 s on slow 4G, mostly network. Tone.js (59 KB gzip) is needed for the first playable moment and starts sample loading, so deferring it would delay piano ready to improve an earlier, non-interactive milestone, at the cost of a new asynchronous audio lifecycle. React is needed for the first render. The sound settings and practice history components are a few KB each. None of these trades is worth its complexity today; revisit if the budget below is approached.

## Budget

`npm run budget` (in CI after the build) fails when the learner download grows past the measured baseline plus about 10%:

| Measure                     | Baseline | Limit   |
| --------------------------- | -------- | ------- |
| Learner scripts, gzip       | 188 KB   | 207 KB  |
| Stylesheets, gzip           | 5.3 KB   | 8 KB    |
| Offline cache, uncompressed | 2.41 MB  | 2.65 MB |
| Offline cache, files        | 47       | 55      |

Timings are too noisy on shared CI runners to gate on; bytes are deterministic and are what drove the timings above. To raise a limit, run `npm run perf` before and after the change, record both here, and update `BUDGET` in `scripts/check-budget.mjs` in the same commit.
