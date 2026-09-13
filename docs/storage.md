# Local storage, schemas and migration policy

Everything the coach remembers stays in the browser. There is no account and no server-side copy. This page is the contract for changing what is stored.

## What is stored

One `localStorage` key, `piano-practice:library`, owned by `application/library.ts`:

| Field             | Contents                                                                                |
| ----------------- | --------------------------------------------------------------------------------------- |
| `version`         | Library schema version, currently `2`.                                                  |
| `last`            | The last committed assignment, as a share fragment.                                     |
| `tempo`           | Integer BPM within the tempo control's range, or `null`.                                |
| `starred`         | Up to 50 `{ fragment, title, starredAt }`, newest first.                                |
| `preferences`     | `labelMode`, `sessionLength`, `revisitAfterDays`.                                       |
| `practiceRecords` | Up to 200 practice records (`application/practice-record.ts`, record schema version 1). |

Assignments are always stored as **share fragments** and read back through the same strict decoder as a shared link (`domain/share.ts`). Storage can therefore never open an assignment a link could not, and existing links and stored assignments share one compatibility promise.

A second key, `piano-practice:theme`, holds the visual theme as the bare string `studio` or `paper` (`coach/theme.ts`). It is a presentation preference, kept apart from the versioned library so that the inline script in `index.html` can read it before first paint. A first visit always uses `studio`; the operating-system colour scheme is intentionally ignored. Any other value reads as `studio`. Clearing history leaves it alone.

The musical QA audition page keeps its in-progress review ledger under its own key; it is maintainer-only.

## Guarantees

- **Every read is validated.** Corrupt JSON, oversized data (over 1 MB), unknown versions and malformed entries are dropped individually; valid entries next to them are kept. Tests: `tests/library.spec.js`, `tests/practice-record.spec.js`.
- **Every write is best effort.** Quota errors and blocked storage leave the app working without memory; practice reports once that the latest history could not be saved.
- **Tabs do not erase each other.** Every change is applied to a fresh read of storage, not to the copy loaded at startup, and other tabs refresh when the `storage` event fires.
- **Older builds do not destroy newer data.** A library whose `version` is higher than the running build understands is treated as empty _and never written_. Opening an old tab beside an updated one, or rolling a deploy back, leaves the newer data intact for when the newer build returns.
- **Clearing history clears only history.** Stars, tempo and preferences are kept.
- **Records describe what the learner did, not how well.** Active time counts only while the page is visible and uses a monotonic clock. MIDI input is never treated as evidence of accuracy. Bar markers, labels and notes are always entered by hand.

## Export and import

_Recent practice → Export history_ downloads a versioned JSON file (`PRACTICE_HISTORY_EXPORT_VERSION`). Import validates every record, skips IDs already present, and keeps the 200 most recent. It is the supported way to move history to another browser, or to keep it before clearing site data.

## Changing a schema

1. **Any new stored field needs a version bump**, even an optional one. The readers (`validatedLibrary`, `parsePracticeRecord`) rebuild each entry from the fields they know, so an older build that saved the library would silently drop a field it does not know. Bumping the version makes older builds leave the data alone instead. The same applies to a renamed, removed or retyped field, or a change in meaning.
2. **When bumping:**
   - Increase `LIBRARY_VERSION` (or the record/export schema version).
   - Read every earlier version and migrate it forward in the reader, as version 1 is today. Never delete the old reader in the same release.
   - Write only the new version.
   - Remember that the previous release will see the new version as "newer" and will neither read nor overwrite it. That is the intended rollback behaviour; say so in the release notes.
3. **Share fragments are a public format.** Links already sent must keep opening. Any change to `domain/share.ts` needs a new `v=` value with the old one still decoded, plus tests for both.
4. **Test the migration** with a fixture written by the previous version, including malformed entries and a future version, and add the two-tab case if the change affects writes.
5. **Musical meaning is not storage.** If a stored assignment would now generate different music, that is a musical change: it needs updated fingerprints and a listening review ([musical-qa.md](musical-qa.md)).
