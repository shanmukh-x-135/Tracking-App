# Production bring-up

Mosaic is prepared for Vercel and uses the hosted Supabase project `wyvhemuzxrqvgflqwfjd` (`https://wyvhemuzxrqvgflqwfjd.supabase.co`). Always verify that reference before a remote database operation. Never run Mosaic migrations against another project.

## Live bring-up record

As of 15 September 2026:

- All nine migrations in `supabase/migrations/` are applied to the hosted project, and its migration history is aligned to the checked-in timestamps.
- All 16 expected public tables have RLS enabled. Anonymous Data API access is read-only for intentionally public rows; authenticated writes are explicitly granted and owner-scoped.
- Hosted rollback-only smoke tests passed for cross-user isolation, private lists, catalog write protection, all four domain tracking models, mixed-list notes/reordering, import idempotency, and safe undo. The tests left no fixture rows behind.
- Supabase's security advisor reports only the three intentional authenticated `SECURITY DEFINER` RPCs. Each RPC derives ownership from `auth.uid()` and was exercised against a foreign user. Performance notices are unused-index informational findings on the empty database.
- Email/password Auth is enabled and email confirmation remains required. An automated hosted sign-up was rate-limited before a controlled inbox could confirm it, so session persistence and profile bootstrap still require a disposable confirmed account.
- Google OAuth is disabled in Supabase. TMDB, IGDB, and Google Books credentials are not present locally, so provider requests and real-artwork QA have not been claimed.
- The app was run locally in live mode using the verified project URL and a publishable key supplied only to the process. Public routes, auth gating, isolated provider failures, and responsive layouts were checked without persisting credentials.
- The Vercel connector has no authenticated team and this checkout has no `.vercel/project.json`; no preview or production deployment was created.

Deterministic validation passed: ESLint, strict TypeScript, 37 unit/contract tests, the Next.js production build, and all 26 Playwright tests. Live-mode visual checks covered 1440, 1280, 1024, 768, and 390 pixels.

## Required environments

Create separate Supabase projects for staging and production when practical. In each project:

1. Keep the migrations in `supabase/migrations/` as the schema source of truth.
2. Expose the `public` schema through the Data API. Every Mosaic table has explicit grants and RLS.
3. Set the Auth Site URL to the canonical application origin.
4. Allow the following application redirects in Supabase Auth:
   - `http://localhost:3000/auth/callback`
   - the exact Vercel preview callback origin(s) approved for the team
   - `https://<production-domain>/auth/callback`
5. Configure Google OAuth in Supabase and add `https://wyvhemuzxrqvgflqwfjd.supabase.co/auth/v1/callback` as an authorized redirect URI in the Google OAuth client. Supabase redirects back to the Mosaic `/auth/callback` route after provider authentication.
6. Review password strength, leaked-password protection, rate limits, CAPTCHA, custom SMTP, backups, and point-in-time recovery before inviting real users.

The browser receives only the Supabase URL and publishable key. Provider credentials and database passwords remain server-side.

## Vercel

Import `shanmukh-x-135/Tracking-App` into Vercel, link this checkout with `vercel link`, and configure the following separately for Preview and Production:

```text
NEXT_PUBLIC_DATA_MODE
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
TMDB_API_READ_TOKEN
IGDB_CLIENT_ID
IGDB_CLIENT_SECRET
GOOGLE_BOOKS_API_KEY
```

Set `NEXT_PUBLIC_DATA_MODE=live` only when the corresponding Supabase project has received all migrations. Public environment values are frozen into the client bundle during `next build`, so redeploy after changing them.

Use Vercel's encrypted environment-variable controls for secrets. Do not paste provider credentials into repository files or build logs. Create and validate a preview from `chore/live-bringup` before promoting the same commit to production.

## Hosted migrations

The `Deploy Mosaic database` GitHub workflow is intentionally manual. Configure a protected GitHub `production` environment with:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
```

Require reviewer approval for that environment. Run the workflow from `main` and enter `deploy-mosaic`. It links only the project identified by `SUPABASE_PROJECT_ID`, performs a dry run, applies pending version-controlled migrations, and lints the hosted schema. Confirm the project reference in the workflow log before approving the protected environment deployment.

## Provider verification

With all provider credentials present, run:

```bash
npm run providers:smoke
```

The smoke test performs search and detail lookup for TMDB movies, TMDB series, IGDB games, and Google Books. It prints titles only and never prints credentials. Deterministic provider contract tests remain the CI default.

The public Credits page contains the required TMDB notice and provider attribution. Google Books search results link to the corresponding Google Books record and display the official Powered by Google mark.

## Release checklist

1. Run the complete CI suite against the release commit.
2. Apply migrations to staging through the guarded workflow.
3. Run live auth, provider, import, export, and RLS smoke tests on staging.
4. Deploy a Vercel preview and test every OAuth redirect origin.
5. Promote the exact validated commit to production.
6. Apply production migrations with protected-environment approval.
7. Re-run read-only smoke tests and inspect Supabase security/performance advisors.

Do not use personal production history for migration testing. Use sanitized fixtures and disposable test accounts.

Provider-backed discovery shelves must remain in deterministic mock mode until TMDB, IGDB, and Google Books search/detail checks all pass in the intended hosted environment. One provider failure is isolated by the catalog aggregator and must not collapse results from the others.
