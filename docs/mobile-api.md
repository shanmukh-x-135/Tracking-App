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
| Library | `GET /api/me/library` | `{ items: LibraryEntry[] }` | Media is normalized Mosaic catalog data, not raw provider data. |
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

These existing routes are provider-normalized server contracts and may be
called without Mosaic account authentication:

| Capability | Path |
| --- | --- |
| Search | `GET /api/catalog/search?q=<query>&type=<movie|tv|game|book>` |
| Detail | `GET /api/catalog/:provider/:type/:id` |
| Episode ratings | `GET /api/catalog/:provider/tv/:id/episode-ratings` |

Related, season, watch-provider, discover, theme, and genre routes remain
available to the web app. Provider credentials and raw TMDB, IGDB, and Google
Books payloads remain server-side; clients receive Mosaic catalog shapes.

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
