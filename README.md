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
- `src/app/api/`: server-only catalog and authenticated persistence endpoints.
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

The Phase 2 implementation provides persistent auth, shared lists/library/ratings/reviews, domain logs, universal provider search, normalized detail pages, user search, activity, and responsive UI. It does not yet include production social follows/comments, recommendation pipelines, media imports, notifications, or moderation tooling.
