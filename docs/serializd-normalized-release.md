# Serializd normalized JSON release verification

Branch: `feat/serializd-normalized-json-import`; PR: [#13](https://github.com/shanmukh-x-135/Tracking-App/pull/13).

The personal acceptance file remains outside the repository. No personal Production import has been performed.

## Acceptance totals checked locally

| Source fact | Count |
| --- | ---: |
| Shows / captured titles / null titles | 67 / 48 / 19 |
| Watched / watchlisted / watching / paused / dropped shows | 44 / 22 / 6 / 5 / 0 |
| Watched / watchlist season records | 121 / 82 |
| Events / enabled canonical events | 676 / 661 |
| Episode / season / show events | 647 / 27 / 2 |
| Duplicate groups / disabled extras | 12 / 15 |
| Explicit rewatches / rated records / liked records / text reviews | 5 / 4 / 4 / 0 |
| Total writable source records | 946 |
| Exact enabled target resolutions / skipped extras / unresolved | 931 / 15 / 0 |

The exact-provider read-only dry run passed on 18 September 2026 after transient TMDB connection resets. Failed attempts remained unresolved without fuzzy fallback or tracking writes.

## Local verification

- Lint, strict typecheck, unit tests, production build, and migration schema lint pass.
- Database migrations apply from scratch. Disposable local Auth users and their data are deleted after live tests.
- Live database tests cover cross-user denial, historical dates, half-stars, distinct rewatches, cross-job idempotency, unchanged-created-row undo, preservation of later edits, and preservation of unrelated movie data.
- Browser suite: 35 passed; four protected Production tests skipped locally. JSON upload recognition, invalid version rejection, optional favorites, refresh, historical activity, and undo pass. Screenshots inspected at desktop/mobile, with overflow checked at 1440/1280/1024/768/390 widths.

## Release gates

Pending: final branch CI, authenticated Preview real-file dry run, merge, main CI, guarded hosted migration, authenticated Production domain verification, and cleanup.

Preview is deployment-protected; authenticated Vercel CLI requests can reach it. The Supabase connection currently fails OAuth refresh and the local CLI has no Supabase access token. Reconnect Supabase or provide a confirmed disposable acceptance login through a secure environment to complete hosted checks. Do not treat a local-only dry run as hosted release approval.

**Safe to import the personal Production account now: NO — not released or hosted-verified.**
