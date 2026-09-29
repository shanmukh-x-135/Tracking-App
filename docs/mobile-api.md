# Mosaic mobile-ready API surface

This document records the stable server contracts a future native client may
use. The native app should authenticate with the Supabase SDK, then send its
Supabase access token as `Authorization: Bearer <access-token>` to Mosaic.
Mosaic validates that token with Supabase before executing user-scoped queries;
the same token is forwarded to PostgREST, so the existing RLS policies remain
in effect. Browser cookie sessions follow the same server-auth path.

No endpoint accepts a client-provided owner ID. Access tokens must not be
logged, persisted by Mosaic, or sent in query strings.

## Contract conventions

All endpoints return JSON. New and normalized private endpoints use this
failure envelope:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required."
  }
}
```

Supported codes are `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION_ERROR`, `CONFLICT`, `PROVIDER_UNAVAILABLE`, and `INTERNAL_ERROR`.
Clients must use the code for control flow and show the message as a safe,
human-readable fallback. Current older catalog/import/list routes retain their
existing string error shape until their contracts are individually normalized.

Mosaic intentionally does not use a `/v1` path today: these routes evolve
backward-compatibly and the existing web API remains their source of truth.

## Private endpoints ready for a native client

| Capability | Method and path | Response | Notes |
| --- | --- | --- | --- |
| Authenticated identity/profile | `GET /api/me` | `{ id, profile }` | `profile` is `null` only for a legacy account whose profile has not been created yet. |
| Current media / Continue | `GET /api/me/continue?limit=20` | `{ items: ContinueItem[] }` | `limit` is optional (1–100 when supplied). Without it, all active items are returned in Home order. |
| Library | `GET /api/me/library?type=&status=&sort=` | `{ items: LibraryEntry[] }` | Complete tile-ready tracked collection; all query parameters are optional. |
| Activity/diary | `GET /api/me/activity?limit=50` | `{ items: ActivityEvent[] }` | `limit` is 1–100; returned events are newest first. |
| Lists | `GET /api/me/lists` | `{ items: UserList[] }` | Cross-media list order is the item `position`. |
| Stats | `GET /api/me/stats` | `MosaicAnalytics` | Rebuildable projection; no derived analytics row is mutable. |
| Mutations/logging | `POST /api/me/state` | updated `MosaicState` | The existing web mutation contract is the validated shared command surface below. |

`GET /api/me/state` remains a web-compatible full snapshot endpoint. Native
screens should prefer the concise endpoint for their use case. `GET
/api/me/media-state` remains available for compact card synchronization.

### `ContinueItem`

`GET /api/me/continue` is the mobile-safe projection used by Mosaic Home. It
contains only resumable media: a series whose authoritative state is
`watching`, a book with a `reading` record, or a game with a `playing`
playthrough. Movies do not currently have a resumable/in-progress state in
Mosaic and are therefore never returned. `paused`, finished/completed,
dropped/DNF, archived, and saved-only states are excluded. In particular,
Serializd's historical `watched_any` fact does not activate a series; only its
explicit `currently_watching` fact does. Paused imported series remain
excluded because Home currently treats pause as non-resumable.

Items use the existing Home ordering: descending active-state activity time,
then a stable kind/title/provider-identity tie-break. The optional `limit`
query parameter is a presentation convenience, not a server-side Home cap.

| Field | Type | Nullable / optional behavior | Meaning and applicability |
| --- | --- | --- | --- |
| `id` | string | never null | Mosaic provider-qualified identity (`provider:mediaType:providerId`). |
| `mediaType` | `"series" \| "book" \| "game"` | never null | Home-friendly media kind. Series corresponds to Mosaic catalog `tv`. |
| `provider` | `"tmdb" \| "igdb" \| "googlebooks" \| "mock"` | never null | Catalog provider; use with `providerId` for provider operations. |
| `providerId` | string | never null | Provider-native catalog identifier. |
| `title` | string | never null | Catalog-normalized display title. |
| `posterUrl` | string | omitted when unavailable | Already-normalized artwork URL. Do not reconstruct provider image URLs. |
| `backdropUrl` | string | omitted when unavailable | Already-normalized artwork URL. Do not reconstruct provider image URLs. |
| `status` | `"watching" \| "reading" \| "playing"` | never null | The authoritative active state that qualified this item. |
| `lastActivityAt` | ISO-8601 string or `null` | `null` only if no active-state timestamp is available | Timestamp used by the existing Home ordering. |
| `progress` | progress object | never null | Structured, media-specific tracking values below; never parse a UI display string. |
| `nextAction` | action object | never null | Domain-aware action a client can offer. |

`progress` is one of the following shapes, selected by `mediaType`:

| `mediaType` | Progress fields | Null semantics |
| --- | --- | --- |
| `series` | `watchedEpisodes` (number), `totalEpisodes` (number or `null`), `percent` (number or `null`), optional `nextSeasonNumber` and `nextEpisodeNumber` | `totalEpisodes` and `percent` are `null` when Mosaic lacks an aired, non-special episode denominator. This is unknown, not `0%`. |
| `book` | `currentPage` (number or `null`), `totalPages` (number or `null`), `percent` (number or `null`) | Each unavailable page value is `null`; `percent` is `null` unless a recorded percentage or valid page denominator exists. A real zero-percent reading is `0`. |
| `game` | `percent` (number or `null`), `playtimeMinutes` (number) | `percent` is `null` when no completion percentage was recorded. `playtimeMinutes` may legitimately be `0`. |

`nextAction` has one of these shapes:

| Media type | Shape |
| --- | --- |
| `series` | `{ "type": "log_episode", "seasonNumber"?: number, "episodeNumber"?: number }` |
| `book` | `{ "type": "update_book_progress" }` |
| `game` | `{ "type": "update_game_playthrough" }` |

The next episode coordinates are omitted when Mosaic cannot determine a next
aired episode. The current contract does not expose an episode title because
the persisted Home projection does not retain one for an unwatched episode.

Example response:

```json
{
  "items": [
    {
      "id": "tmdb:tv:1396",
      "mediaType": "series",
      "provider": "tmdb",
      "providerId": "1396",
      "title": "Breaking Bad",
      "posterUrl": "https://image.tmdb.org/t/p/w500/example.jpg",
      "backdropUrl": "https://image.tmdb.org/t/p/w1280/example.jpg",
      "status": "watching",
      "lastActivityAt": "2026-09-21T18:22:00.000Z",
      "progress": {
        "watchedEpisodes": 14,
        "totalEpisodes": 62,
        "percent": 23,
        "nextSeasonNumber": 2,
        "nextEpisodeNumber": 1
      },
      "nextAction": { "type": "log_episode", "seasonNumber": 2, "episodeNumber": 1 }
    },
    {
      "id": "googlebooks:book:volume-42",
      "mediaType": "book",
      "provider": "googlebooks",
      "providerId": "volume-42",
      "title": "The Left Hand of Darkness",
      "status": "reading",
      "lastActivityAt": "2026-09-20T09:00:00.000Z",
      "progress": { "currentPage": 96, "totalPages": 304, "percent": 32 },
      "nextAction": { "type": "update_book_progress" }
    },
    {
      "id": "igdb:game:7346",
      "mediaType": "game",
      "provider": "igdb",
      "providerId": "7346",
      "title": "Hades",
      "status": "playing",
      "lastActivityAt": "2026-09-19T20:15:00.000Z",
      "progress": { "percent": null, "playtimeMinutes": 245 },
      "nextAction": { "type": "update_game_playthrough" }
    }
  ]
}
```

### Library

`GET /api/me/library?type=<movie|tv|game|book>&status=<LibraryStatus>&sort=<updated|title|rating|release>`
returns the complete tracked Mosaic Library, not the smaller Home Continue
subset. Authentication is required: send the Supabase access token as
`Authorization: Bearer <access-token>` (or use a browser session). A 401 means
the credential is missing, expired, or invalid; a transient Library failure
does not change the client's authentication state.

The response is `{ "items": LibraryEntry[] }`. It is deliberately
unpaginated: every matching entry is returned, so client-side filtering and
sorting are correct when no server query parameters are used. There is no page
size, cursor, offset, or next-page token. The default stable order is most
recent `updatedAt` first, with provider-qualified identity as a tie-break.

`type`, `status`, and `sort` are optional server-side filters. `type=tv` is
the **Series** filter. `status` uses the values below and can be used with or
without `type`; a valid combination with no matching items returns an empty
array. Unsupported values return 400. Sorting applies after filtering:
`updated` (default, newest first), `title` (ascending), `rating` (highest user
rating first; unrated last), and `release` (newest known release year first;
unknown years last).

Library contains every media item explicitly retained in Mosaic's library
state, including watched/watchlist movies; watching, completed, paused,
dropped, and watchlist series; reading, finished, paused, DNF, and
want-to-read books; and playing, completed, paused, dropped, and backlog
games. Removing an item from Library removes it from this endpoint. Historical
activity alone never creates a Library entry.

#### `LibraryEntry` fields

| Field | Type | Nullable / optional behavior | Meaning |
| --- | --- | --- | --- |
| `id` | string | required | Canonical provider-qualified identity: `provider:mediaType:providerId`. |
| `mediaType` | `"movie" \| "tv" \| "game" \| "book"` | required | Catalog domain; `tv` is Series. |
| `provider` | `"tmdb" \| "igdb" \| "googlebooks" \| "mock"` | required | Catalog provider. |
| `providerId` | string | required | Opaque provider-native ID. Never title-match or coerce to a number. |
| `title` | string | required | Normalized catalog title. |
| `posterUrl` | string | omitted if unavailable | Fully qualified poster/cover URL. |
| `backdropUrl` | string | omitted if unavailable | Fully qualified wide artwork URL. |
| `releaseYear` | number | omitted if unknown | Movie release, series first-air, game release, or book publication year. |
| `status` | `LibraryStatus` | required | Domain-appropriate personal Library state. |
| `userRating` | number or `null` | `null` means the user has not rated this item | Mosaic user rating: 0.5–5.0 inclusive, in 0.5-star increments. This is distinct from catalog `communityRating`. |
| `isFavorite` | boolean | required | User's Library favorite flag. |
| `updatedAt` | ISO-8601 string | required | Last Library state update; used by default ordering. |
| `progress` | progress object | omitted for movies and for books/games without a persisted reading/playthrough; present for series | Structured personal progress; never parse a display string. |

Artwork URLs are already fully qualified and normalized. iOS must never append
provider-specific TMDB, IGDB, or Google Books image URL segments. The fields
above make every tile renderable without catalog detail fan-out.

#### `LibraryStatus` by media type

| Media type | Valid JSON status values |
| --- | --- |
| movie | `watchlist`, `watched` |
| tv | `watchlist`, `watching`, `completed`, `paused`, `dropped` |
| game | `backlog`, `playing`, `paused`, `completed`, `dropped` |
| book | `want_to_read`, `reading`, `paused`, `finished`, `dnf` |

`status` is never null. Labels such as “Want to read” and “DNF” are client
presentation choices for the exact wire values above.

#### Library progress

| Media type | Shape | Null semantics |
| --- | --- | --- |
| tv | `{ watchedEpisodes, totalEpisodes, percent, nextSeasonNumber?, nextEpisodeNumber? }` | `totalEpisodes` and `percent` are `null` when Mosaic lacks an aired, non-special denominator; this is unknown, not zero progress. |
| book | `{ currentPage, totalPages, percent }` | Omitted if there is no persisted reading. Otherwise page fields are `null` when unknown; `percent` is `null` unless recorded directly or calculable from known pages. A real zero percent remains `0`. |
| game | `{ playtimeMinutes, percent }` | Omitted if there is no persisted playthrough. Otherwise `playtimeMinutes` is a known non-negative integer (zero is valid); `percent` is `null` if no completion percentage was recorded. |
| movie | omitted | Mosaic has no resumable movie progress state. |

Series watched counts and next episode coordinates use Mosaic's existing
released-episode logic. Book and game progress are the most recently updated
reading/playthrough for the Library item; status remains the authoritative
Library status.

Example:

```json
{
  "items": [
    {
      "id": "mock:movie:dune-part-two",
      "mediaType": "movie",
      "provider": "mock",
      "providerId": "dune-part-two",
      "title": "Dune: Part Two",
      "posterUrl": "https://images.example/movie.jpg",
      "releaseYear": 2024,
      "status": "watched",
      "userRating": 4.5,
      "isFavorite": true,
      "updatedAt": "2026-09-20T10:00:00.000Z"
    },
    {
      "id": "tmdb:tv:1396",
      "mediaType": "tv",
      "provider": "tmdb",
      "providerId": "1396",
      "title": "Breaking Bad",
      "status": "watching",
      "userRating": null,
      "isFavorite": false,
      "updatedAt": "2026-09-19T10:00:00.000Z",
      "progress": { "watchedEpisodes": 14, "totalEpisodes": 62, "percent": 23, "nextSeasonNumber": 2, "nextEpisodeNumber": 1 }
    },
    {
      "id": "googlebooks:book:volume-42",
      "mediaType": "book",
      "provider": "googlebooks",
      "providerId": "volume-42",
      "title": "The Left Hand of Darkness",
      "status": "finished",
      "userRating": 5,
      "isFavorite": false,
      "updatedAt": "2026-09-18T10:00:00.000Z",
      "progress": { "currentPage": 304, "totalPages": 304, "percent": 100 }
    },
    {
      "id": "igdb:game:7346",
      "mediaType": "game",
      "provider": "igdb",
      "providerId": "7346",
      "title": "Hades",
      "status": "playing",
      "userRating": null,
      "isFavorite": false,
      "updatedAt": "2026-09-17T10:00:00.000Z",
      "progress": { "playtimeMinutes": 245, "percent": null }
    }
  ]
}
```

Library uses the normalized mobile error envelope. 400 `VALIDATION_ERROR`
means an unsupported `type`, `status`, or `sort`; correct and retry the
request. 401 `UNAUTHORIZED` means the credential must be refreshed or the user
must sign in. 404 and 429 are not used by this unpaginated collection route.
500 `INTERNAL_ERROR` means the account's Library state could not be loaded;
retry conservatively. No database, Supabase, or provider internals are
included in error messages.

### Mutation command body

`POST /api/me/state` accepts exactly one discriminated `PersistenceMutation`.
The server owns validation through Zod and rejects malformed input with
`VALIDATION_ERROR`; it never accepts `userId`.

| Domain | Commands |
| --- | --- |
| Movie logging | `movie.log`, `movie.update`, `movie.delete` |
| Episode/season logging | `episode.log`, `episode.unwatch`, `season.state` |
| Book progress | `book.upsert` |
| Game progress | `game.upsert` |
| Library/state | `library.upsert`, `library.remove`, `rating.set`, `review.save`, `review.delete`, `settings.watchRegion` |
| Lists | `list.create`, `list.add`, `list.update`, `list.item.update`, `list.item.remove`, `list.reorder` |

The body uses the existing `catalogMediaSchema` and status restrictions from
`src/lib/persistence/validation.ts`. That preserves one server source of
truth for episode uniqueness, rewatch behavior, list ordering, valid domain
statuses, and book-progress normalization. A finished book is normalized to
100%, with its final page set when a total is supplied.

## Public catalog endpoints

Catalog search and media detail are public: no Mosaic account or Bearer token
is required, and their payload never gains user tracking state when a token is
present. Personal state belongs to `/api/me/*`. Provider credentials and raw
TMDB, IGDB, and Google Books payloads remain server-side.

### Catalog identity and artwork

Every search result and detail response has the same opaque identity tuple:
`provider`, `mediaType`, and string `providerId`. Use that exact tuple to form
the detail URL: `GET /api/catalog/{provider}/{mediaType}/{providerId}`. Do not
title-match, parse IDs as numbers, or substitute another provider.

`posterUrl` and `backdropUrl`, when present, are fully qualified HTTPS URLs
already normalized by Mosaic. `posterUrl` is the cover/poster for all four
media types; `backdropUrl` is optional wide artwork. Native clients must never
append TMDB, IGDB, or Google Books image base URLs.

### Cross-media search

`GET /api/catalog/search?q=<query>&type=<movie|tv|game|book>` returns:

```json
{ "items": ["CatalogMedia"], "failures": ["CatalogFailure"], "profiles": ["CatalogProfile"] }
```

`q` is required after trimming and must contain 2–100 characters. Search is
case-insensitive as implemented by each normalized provider. Omit `type` for
the true **All** aggregate: Mosaic queries all configured catalog providers,
deduplicates by the provider-qualified identity, and then returns their
provider-normalized results. `type` filters that aggregate to the requested
Mosaic media type; `tv` is the value for the UI label **Series**.

| UI filter | Query parameter | Included media type |
| --- | --- | --- |
| All | omit `type` | movie, tv, game, book |
| Movies | `type=movie` | movie |
| Series | `type=tv` | tv |
| Games | `type=game` | game |
| Books | `type=book` | book |

There is no pagination or global result cap. Provider-local limits currently
apply (mock: 20; TMDB: up to 40 across two pages; IGDB: 8; Google Books: 8).
Ordering is the configured provider order followed by each provider's own
ranking; it is not a global cross-provider relevance score. A successful
provider's results are retained when another provider fails, with that failure
listed in `failures`.

#### Search response fields

`items` contains the same `CatalogMedia` discriminated union returned by
detail. These common fields are present for all types unless marked optional:

| Field | Type | Optional behavior | Meaning |
| --- | --- | --- | --- |
| `provider` | `"tmdb" \| "igdb" \| "googlebooks" \| "mock"` | required | Catalog source. |
| `providerId` | string | required | Opaque provider-native ID. |
| `mediaType` | `"movie" \| "tv" \| "game" \| "book"` | required | Mosaic catalog domain. |
| `title` | string | required | Normalized display title. |
| `originalTitle` | string | omitted if unavailable | Provider original-language title, where supplied. |
| `description` | string | omitted if unavailable | Normalized synopsis/summary. Google Books HTML is converted to plain text. |
| `posterUrl` / `backdropUrl` | string | each omitted if unavailable | Fully qualified artwork URLs. |
| `releaseDate` | string | omitted if unavailable | Provider-normalized partial or full publication/release date; do not assume `YYYY-MM-DD`. |
| `releaseYear` | number | omitted if unavailable | Four-digit year derived from the release date when available. |
| `genres` | string array | required; may be empty | Normalized provider categories/genres. |
| `communityRating` | number | omitted if unavailable | Public provider rating. It is not a user rating and its scale remains provider-specific (TMDB commonly 0–10; IGDB, Google Books, and mock catalog commonly 0–5). |

`failures` is an array of `{ provider, message }`; it is present even when
empty. A failure message is safe, generic provider availability text. `profiles`
is a separate optional people-search extension (`id`, `username`,
`displayName`, optional `avatarUrl`) and never appears in `items`; mobile
catalog UI may ignore it.

Illustrative search items (all fields match the actual response):

```json
{
  "items": [
    { "provider": "tmdb", "providerId": "157336", "mediaType": "movie", "title": "Interstellar", "releaseYear": 2014, "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg", "genres": ["Drama"], "communityRating": 8.4 },
    { "provider": "tmdb", "providerId": "1396", "mediaType": "tv", "title": "Breaking Bad", "releaseYear": 2008, "posterUrl": "https://image.tmdb.org/t/p/w500/poster.jpg", "genres": ["Drama"] },
    { "provider": "igdb", "providerId": "7346", "mediaType": "game", "title": "Hades", "posterUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/cover.jpg", "genres": ["Roguelike"] },
    { "provider": "googlebooks", "providerId": "volume-42", "mediaType": "book", "title": "The Left Hand of Darkness", "posterUrl": "https://books.google.com/cover.jpg", "genres": ["Science Fiction"] }
  ],
  "failures": [],
  "profiles": []
}
```

### Media detail

`GET /api/catalog/{provider}/{mediaType}/{providerId}` returns one
`CatalogMedia` object, not an envelope. It includes every common field listed
above plus only the fields applicable to its `mediaType`. Fields not available
from a provider are omitted rather than populated with `null` or fabricated
values.

| Type and route | Additional fields | Semantics |
| --- | --- | --- |
| Movie: `/api/catalog/:provider/movie/:id` | `runtimeMinutes?`, `director?`, `studio?`, `studioLogoUrl?` | Runtime is minutes. Studio artwork is fully qualified when supplied. Watch-provider availability is **not** part of this response. |
| Series: `/api/catalog/:provider/tv/:id` | `seasonCount?`, `episodeCount?`, `seasonNumbers?`, `seasonEpisodeCounts?`, `eligibleEpisodeCounts?`, `eligibleEpisodeCount?`, `seasons?`, `network?`, `networkLogoUrl?` | Counts and season maps are provider metadata, not user progress. Season map keys are provider season numbers and can include `0` for specials. No user tracking status or episode ratings matrix is included. |
| Game: `/api/catalog/:provider/game/:id` | `platforms` (required string array), `developer?`, `publisher?`, `developerLogoUrl?`, `publisherLogoUrl?` | `platforms` may be empty. Company fields and logos are omitted if unavailable. |
| Book: `/api/catalog/:provider/book/:id` | `subtitle?`, `authors` (required string array), `publisher?`, `pageCount?`, `isbn?` | `authors` may be empty. `pageCount` and publication date are omitted when the provider does not supply them. Google Books description HTML is returned as sanitized plain text. |

The common `communityRating` is the only public/provider rating in this
contract. It is omitted when absent; no rating count is exposed by these
routes. Network, platform, publisher, and author data remain type-specific as
shown above.

### Catalog errors

Catalog route errors use the same normalized envelope as private mobile routes:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…" } }
```

| Status | Code | When | Retryable |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing/too-short/too-long query, unsupported `type`, or malformed provider identity | No; correct the request. |
| 401 | — | Not used by documented catalog search/detail; both are public. | — |
| 404 | `NOT_FOUND` | A valid detail identity has no matching catalog item. | No; do not title-match a substitute. |
| 429 | — | Not surfaced as a stable client contract. Upstream throttling is normalized below. | — |
| 503 | `PROVIDER_UNAVAILABLE` | Detail provider failure, or search when every catalog provider fails. | Yes; retry with backoff. |
| 500 | `INTERNAL_ERROR` | Reserved by Mosaic's normalized error model; not intentionally emitted by these routes for expected provider failures. | Potentially; retry conservatively. |

For partial search failures, the route returns HTTP 200 with available `items`
and a non-empty `failures` array. No stack traces, upstream response bodies,
credentials, or provider-specific parsing shapes are exposed.

Related, season, watch-provider, discover, theme, genre, and episode-rating
routes remain web-facing ancillary APIs and are not part of this mobile
Milestone 2 contract.

## Not ready for a native client

The following route families have not yet been normalized to the private API
error envelope or reviewed as a dedicated mobile contract and must not be used
by a native V1 without a focused follow-up:

- import preview, apply, undo, and history (`/api/me/imports/*`)
- account export (`/api/me/export`)
- public list detail (`/api/lists/:id`)
- ancillary catalog discovery/related/watch-provider routes

This is deliberate: it avoids presenting unfinished operational workflows as
native-ready while preserving their existing web behavior.

## Architecture map

| Concern | Server/domain source | HTTP adapter |
| --- | --- | --- |
| Auth/session | `src/lib/auth/server-auth.ts` | cookie or Supabase Bearer token |
| Catalog normalization | `src/lib/media/` | `src/app/api/catalog/` |
| Tracking validation/mutations | `src/lib/persistence/validation.ts`, `supabase-state.ts` | `POST /api/me/state` |
| Current/Continue | `src/lib/current-media/`, `src/lib/tv/series-progress.ts` | `GET /api/me/continue` |
| Library/lists | `src/lib/persistence/` | `GET /api/me/library`, `GET /api/me/lists` |
| Activity/stats | `src/lib/activity/`, `src/lib/analytics/` | `GET /api/me/activity`, `GET /api/me/stats` |

`src/lib/services/mosaic.ts` is the server-only service boundary shared by
the normalized API routes. React components continue to use their current
browser persistence gateway; they are not made to call their own HTTP API from
server components.
