# Mosaic portable export

Mosaic exports the authenticated account as `mosaic-export-v1-YYYY-MM-DD.zip`. The archive is private, generated on demand, and is not retained by Mosaic.

## Version 1 layout

`manifest.json` is the entry point:

```json
{
  "mosaicExportVersion": 1,
  "exportedAt": "2026-09-14T01:02:03.000Z",
  "format": "mosaic-portable-data",
  "files": ["csv/profile.csv", "json/profile.json"]
}
```

Every data section is present in both `json/` and `csv/`. JSON is the canonical representation; CSV mirrors its top-level fields for spreadsheets. Objects and arrays inside a CSV cell are JSON-encoded. Text beginning with `=`, `+`, `-`, or `@` is prefixed with an apostrophe to prevent spreadsheet formula execution.

| Section | Purpose | Identity fields |
|---|---|---|
| `profile` | Account profile and email | `id`, `username` |
| `media` | Provider-backed media referenced elsewhere | `id`, `provider`, `providerId`, `mediaType` |
| `library` | Current library status/favorite state | `mediaId` |
| `ratings` | Media ratings | `id`, `mediaId` |
| `reviews` | Review body and spoiler flag | `id`, `mediaId`, `ratingId` |
| `movie-watch-logs` | Distinct watches and rewatches | `id`, `mediaId` |
| `episode-watches` | Episode watch history and series coordinates | `id`, `seriesMediaId`, `seasonNumber`, `episodeNumber` |
| `episode-ratings` | Episode-level ratings | `id`, `seriesMediaId`, `seasonNumber`, `episodeNumber` |
| `game-playthroughs` | Status, platform, playtime, progress, and dates | `id`, `mediaId` |
| `book-readings` | Status, pages, progress, rating, and dates | `id`, `mediaId` |
| `lists` | User-owned lists, including private lists | `id` |
| `list-items` | Ordered list membership and notes | `id`, `listId`, `mediaId` |

Field names use camel case. Dates are ISO 8601 strings or `null`. Optional provider metadata remains JSON. A consumer should reject unsupported future versions rather than guessing; Mosaic will increment `mosaicExportVersion` for incompatible changes.

In deterministic mock development mode, identifiers are provider-qualified strings and database-only timestamps may be `null`. Hosted exports use persisted UUIDs and timestamps. The section layout and relationships are otherwise the same.
