# Mosaic

Mosaic is a cross-media tracker for movies, television, games, and books. It combines a shared identity, library, ratings, reviews, lists, search, and activity layer with explicit domain flows for movie watches, episodes, game playthroughs, and book progress.

The app runs in two modes:

- `mock` (default): deterministic catalog fixtures, browser-backed accounts, and per-account local persistence. This mode needs no external services.
- `live`: Supabase Auth/Postgres persistence plus TMDB, IGDB, and Google Books catalog search. Missing catalog providers fail independently and the UI keeps working with results from available providers.

## Local setup

Requirements: Node.js 20+, npm, and Docker Desktop if you want the local Supabase stack.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Use `Cmd/Ctrl + K` for universal search. On mobile, the emphasized Log action opens the domain-aware quick log sheet.

The checked-in environment example starts in `mock` mode. Never expose the TMDB, IGDB, or Google Books credentials through `NEXT_PUBLIC_` variables; provider calls run only on the server.

## Live Supabase mode

Start Docker Desktop, then initialize the local database:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:status
```

Copy the API URL and publishable/anon key reported by the CLI into `.env.local` and set:

```dotenv
NEXT_PUBLIC_DATA_MODE=live
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-publishable-key
```

For a hosted project, link the intended Mosaic project and apply the migrations in `supabase/migrations/`. Confirm that the `public` schema is exposed in **Project Settings → API → Exposed schemas**. Mosaic migrations explicitly grant only the required table operations and enable RLS on every exposed table; do not enable automatic unrestricted table exposure as a substitute.

Email/password and Google OAuth are supported in live mode. Add `http://localhost:3000/auth/callback` (and the production equivalent) to Supabase Auth redirect URLs. Configure Google in the Supabase dashboard before using that button.

Hosted Supabase, protected migration, Vercel, OAuth, and release procedures are documented in [Production bring-up](docs/production.md).

The current native/fallback support matrix, CSV templates, reconciliation rules, and provenance model are documented in [Importing into Mosaic](docs/imports.md).

## Import and portability

**Settings → Your data** is the account-data workspace. It provides:

- a native Letterboxd account-export ZIP importer
- source-labelled series, games, and books CSV fallbacks for platforms without a documented export contract
- generic movie, series, game, and book templates in `public/templates/`
- conservative provider matching, manual reconciliation, and a dry-run summary
- explicit conflict policy, persistent job history, idempotent retry, provenance, and safe undo
- a private Mosaic ZIP export with versioned JSON and spreadsheet-safe CSV

Import uploads are authenticated, limited to 12 MB, validated by content, processed transiently, and never placed in public storage. See [Importing into Mosaic](docs/imports.md) and the [export schema](docs/export-schema.md).

## Catalog providers

Add any subset of these server-only values to `.env.local`:

```dotenv
TMDB_API_READ_TOKEN=
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
GOOGLE_BOOKS_API_KEY=
```

- TMDB supplies movies and TV series.
- IGDB supplies games and obtains/caches its app access token server-side.
- Google Books supplies books.

Provider identities remain qualified (`tmdb:movie:…`, `igdb:game:…`, and so on), preventing collisions across domains. External payloads are normalized at adapter boundaries and stored as catalog snapshots rather than leaking provider response shapes into UI components.

## Architecture

- `src/lib/media/`: normalized catalog types, identities, adapters, and aggregation.
- `src/lib/auth/`: mock/live authentication gateways.
- `src/lib/persistence/`: shared and domain mutation types, mock/live gateways, validation, and Supabase state mapping.
- `src/lib/imports/`: typed parsers, source adapters, matching, reconciliation, and mock/live application logic.
- `src/lib/exports/`: versioned portable archive generation and CSV safety.
- `src/app/api/`: server-only catalog, import, export, and authenticated persistence endpoints.
- `supabase/migrations/`: schema, constraints, indexes, grants, triggers, and RLS policies.
- `tests/`: domain, provider, persistence, and migration contract tests.
- `e2e/`: responsive rendering, auth, search, and cross-media persistence journeys.

Client mutations never supply their database owner. The `/api/me/state` route derives the user ID from verified Supabase claims, validates a discriminated mutation payload, and relies on owner-scoped RLS as defense in depth. In mock mode, the equivalent state is namespaced by the stable mock account ID so it survives refresh and sign-out/sign-in.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

`npm run build` uses Next.js’ webpack builder because it is deterministic in restricted CI/container environments. Playwright uses the installed Google Chrome binary.

## Current scope

Phase 3 adds production bring-up tooling, a trustworthy migration pipeline, historical reconstruction, reversible provenance, complete cross-media list editing, and user-owned data export to the Phase 2 product. Native imports currently cover Letterboxd because it is the only target with a suitable documented self-service export; Serializd, Backloggd, and Fable use honest Mosaic CSV fallbacks. Hosted Supabase, OAuth, Vercel, and live provider traffic still require project credentials and must follow the guarded steps in [Production bring-up](docs/production.md). Social follows/comments, notifications, moderation, and recommendation pipelines remain intentionally deferred.
