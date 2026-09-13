# Development, deployment and releases

## Local development

```bash
nvm use                      # Node 22.19+ (.nvmrc)
npm ci
npx playwright install chromium
npm run dev                  # http://127.0.0.1:5173, no service worker
npm run build && npm run preview   # the production bundle, with offline support
npm run check                # everything CI's quality and browser jobs run
```

`npm run check` runs, in order: ESLint, Prettier, strict TypeScript, Vitest (unit, property and component specs), the musical and Score fingerprints, the musical listening gate, the production build, the size budget, and Playwright against the production bundle (desktop and Pixel 7, including the two-deploy service-worker lifecycle).

## Continuous integration

`.github/workflows/ci.yml`, on every push and pull request:

| Job     | Gates                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| quality | `npm audit --audit-level=high`, lint, format, typecheck, unit tests, fingerprints, musical review gate, build, size budget; uploads `dist`. |
| browser | Playwright against the production bundle; uploads the report and traces.                                                                    |
| deploy  | `main` only, after both pass: publishes **the exact `dist` artifact the quality job built** to GitHub Pages.                                |
| smoke   | Waits until Pages serves this commit's `version.json`, then runs `tests/smoke/` against the live site.                                      |

Generated reports: `npm run audit:music` fails if `audits/musical/corpus.json` or its dispositions are stale, and the fingerprint scripts fail on any unapproved musical change. `test-results/outside-collection-notes.md` is a review aid, not a committed artifact.

## Deploying

Pushing to `main` deploys. Every deploy is identified by `https://joecer21.github.io/Piano-Practice/version.json`:

```json
{ "version": "1.0.0", "commit": "<sha>", "cacheVersion": "<offline cache version>" }
```

Learners receive the new version as described in [offline-and-updates.md](offline-and-updates.md): within about ten minutes of opening the app, silently if their page is already current, otherwise through _Reload to update_.

## Releasing

Releases are tagged only after the **deployed** build passes the smoke suite.

1. Set `version` in `package.json` (for example `1.0.0`) and merge to `main`. Wait for CI, including **deploy** and **smoke**, to pass.
2. **Release candidate.** In _Actions → Release → Run workflow_ on `main`, enter `v1.0.0-rc.1`. The workflow checks the tag matches `package.json`, confirms the site serves the current `main` commit, runs the smoke suite against it, and only then creates the tag and a GitHub pre-release.
3. **Clean-environment verification.** On a device and browser profile that has never opened the app:
   - open the site, start a session, and confirm sound;
   - install it (desktop Chrome/Edge, Android Chrome; _Add to Home Screen_ on iOS Safari);
   - go offline (airplane mode), open the installed app, open a share link, play;
   - share a link into a chat app and check the preview card.
     Record the results in the pre-release notes.
4. **Stable.** Run the workflow again on the same commit with `v1.0.0`. If anything was fixed after the candidate, cut `-rc.2` first.

The workflow cannot tag a commit that is not deployed, so a release always names something learners can actually open.

## Rolling back

1. **Revert, do not force-push.** `git revert <bad commits>` on `main` and push. CI tests and deploys the revert like any change. Its build has a different offline cache version, so it reaches learners through the normal update flow; nothing needs to be cleared on devices.
2. Watch the **smoke** job, or run `SMOKE_BASE_URL=https://joecer21.github.io/Piano-Practice/ SMOKE_EXPECTED_COMMIT=<sha> npm run test:smoke` locally.
3. **Stored data survives.** If the bad release introduced a newer storage version, the older build leaves that data untouched rather than overwriting it ([storage.md](storage.md)), so learners get it back when a fixed release returns. Say this in the release notes.
4. **Emergency: the site must stop serving immediately** (for example a worker that breaks pages). Re-run the last good _CI → deploy_ job from the Actions tab to republish its artifact (retained 7 days), or push a revert. Installed copies keep their cache until they next go online and update. A worker that cannot be fixed forward can be retired by deploying a `sw.js` that deletes its caches and calls `self.registration.unregister()`.

## Browser support

The build targets Vite's default "baseline widely available" browsers: Chrome and Edge 111+, Firefox 114+, Safari 16.4+ (macOS and iOS).

| Capability              | Chromium (desktop, Android)            | Firefox               | Safari / iOS                                          |
| ----------------------- | -------------------------------------- | --------------------- | ----------------------------------------------------- |
| Practice, playback      | Yes                                    | Yes                   | Yes; sound starts after the first tap                 |
| Offline after one visit | Yes                                    | Yes                   | Yes                                                   |
| Install                 | Yes                                    | Android only          | _Add to Home Screen_                                  |
| Web MIDI                | Yes (HTTPS, with permission)           | Yes (with permission) | No: the app says so and everything else keeps working |
| Share sheet             | Android; desktop falls back to copying | Copies the link       | Yes                                                   |

**Automated coverage is Chromium only** (desktop and Pixel 7 emulation). Firefox and Safari are supported by target and design but verified manually at release (step 3 above).
