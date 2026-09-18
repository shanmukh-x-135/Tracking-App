# Importing into Mosaic

Mosaic treats imports as private, owner-scoped jobs. Parsing and media matching produce a dry run first; tracking state is written only after every row is accepted or skipped. Re-uploading the same source rows is safe because each parser produces stable source identities and the database records provenance for each applied target.

## Current source support

Research was refreshed on 13 September 2026 against public, first-party documentation.

| Source | Ratings | Reviews | History | Lists | Progress | Import path |
|---|---:|---:|---:|---:|---:|---|
| Letterboxd | Yes | Yes | Movie diary + rewatches | Yes | N/A | Native account-export ZIP |
| Serializd | Yes | No | Episode rows and dates | No | Episode status | Mosaic series CSV fallback |
| Backloggd | Yes | No | One playthrough row per record | No | Status, playtime, percent | Mosaic games CSV fallback |
| Fable | Yes | Yes | Reading state and dates | No | Pages | Mosaic books CSV fallback |

“Fallback” means the field is supported by Mosaic's documented template, not that Mosaic understands an undocumented native file.

### Prepared Serializd normalized JSON

Settings → Your data also accepts **Mosaic Serializd Normalized Export v1** JSON (`schema: mosaic.serializd.normalized-export`, `schema_version: 1`). This is a user-provided interchange contract, not a native Serializd export. Files are bounded to 12 MB and 20,000 total writable records and validated before provider lookup or job creation.

Shows resolve only by exact TMDB TV ID. Season IDs must belong to that show and episode numbers must exist in that exact season. Missing source titles are valid; fuzzy title matching is never used. Dry runs show source totals, unresolved targets, disabled duplicate extras, and previous import provenance. Resolve provider outages by retrying the preview, or explicitly skip unresolved rows.

Show facts remain independent (watched, watchlisted, watching, paused, dropped). Watched seasons create state without inventing episode dates. Canonical events retain their historical `occurred_at`, half-star ratings, review/spoiler metadata, tags, and distinct rewatches. `created_at` and season `date_added` are source provenance, not diary dates. Explicit show favorites are optional; event likes are never favorites. Unsupported season ratings, source lists, profile identity/country, aggregate statistics, and social snapshots stay informational in private import records. Imports never change account identity or watch region.

Same-source stable keys and owner-scoped provenance prevent repeat imports. Undo removes only unchanged rows created by the import; existing data and later edits survive. Portable exports include series facts, season states, TV history, and episode rewatch metadata.

Read-only real-file validation (never writes tracking data):

```bash
npx tsx scripts/serializd-dry-run.ts /absolute/path/to/serializd_export_normalized.json
```

### Why only Letterboxd is native

- [Letterboxd's official FAQ](https://letterboxd.com/about/faq/#exporting-data) documents an account export that bundles the account into a ZIP of CSV files. Mosaic recognizes current watched, ratings, reviews, diary, watchlist, and list CSV concepts while ignoring the deleted-content folder by default.
- [Backloggd's official roadmap](https://backloggd.com/roadmap/) still presents exporting Backloggd data as a requested/planned feature. Mosaic therefore does not pretend that an authoritative Backloggd CSV schema exists.
- [Serializd's official site](https://www.serializd.com/) advertises imports from TV Time and Trakt, but does not publish a self-service account-export contract. Mosaic does not ask for Serializd credentials or scrape private pages.
- [Fable's privacy policy](https://fable.co/privacy) describes requesting access to personal information in a machine-readable form where feasible, but does not publish a stable media-history export schema. Mosaic uses the books template until one exists.

## Templates

Download the templates from **Settings → Your data** or from `public/templates/`:

- `movies.csv`: title, year, watched date, rating, review, rewatch, status
- `series.csv`: series title, season/episode, episode title, watched date, rating, status
- `games.csv`: title, platform, status, dates, playtime, completion percentage, rating
- `books.csv`: title, author, status, dates, page progress, rating, review

Files must be UTF-8 CSV and no larger than 12 MB. Dates use `YYYY-MM-DD`; ratings use 0.5–5 in half-star increments. Invalid rows are reported without mutating the library.

## Conflict and undo model

The job-level policy is explicit: keep Mosaic, use imported, or keep Mosaic and report conflicts. Distinct historical events merge. Database application runs one source record per transaction, so a record cannot leave half its related changes behind. Provenance stores the applied snapshot and fingerprint for later safe undo; Mosaic must preserve a row if it was manually edited after import.

The uploaded source archive itself is not stored. Normalized private records and reconciliation choices are retained with the owner-scoped job so work can resume safely.

## Local verification

Use mock mode for the full browser journey without third-party traffic:

```bash
npm test
npx playwright test e2e/import.spec.ts e2e/export.spec.ts
```

Sanitized parser fixtures live in `fixtures/imports/`; the downloadable templates live in `public/templates/`. In live mode, start/reset local Supabase first and use a disposable account. Import application is record-transactional, so retrying a partially successful job is safe.

Mosaic’s own portable ZIP is documented in [the version 1 export schema](export-schema.md).
