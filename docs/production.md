# Production bring-up

Mosaic is prepared for Vercel and a dedicated hosted Supabase project. This repository is not currently linked to a Mosaic Supabase project, and the available Supabase MCP connection belongs to an unrelated procurement application. Never run Mosaic migrations against that project.

## Required environments

Create separate Supabase projects for staging and production when practical. In each project:

1. Keep the migrations in `supabase/migrations/` as the schema source of truth.
2. Expose the `public` schema through the Data API. Every Mosaic table has explicit grants and RLS.
3. Set the Auth Site URL to the canonical application origin.
4. Allow the following exact redirects:
   - `http://localhost:3000/auth/callback`
   - the Vercel preview callback pattern approved for the team
   - `https://<production-domain>/auth/callback`
5. Configure Google OAuth in Supabase and add Supabase's provider callback URL to the Google OAuth client.
6. Review password strength, leaked-password protection, rate limits, CAPTCHA, custom SMTP, backups, and point-in-time recovery before inviting real users.

The browser receives only the Supabase URL and publishable key. Provider credentials and database passwords remain server-side.

## Vercel

Import `shanmukh-x-135/Tracking-App` into Vercel and configure the following separately for Preview and Production:

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

## Release checklist

1. Run the complete CI suite against the release commit.
2. Apply migrations to staging through the guarded workflow.
3. Run live auth, provider, import, export, and RLS smoke tests on staging.
4. Deploy a Vercel preview and test every OAuth redirect origin.
5. Promote the exact validated commit to production.
6. Apply production migrations with protected-environment approval.
7. Re-run read-only smoke tests and inspect Supabase security/performance advisors.

Do not use personal production history for migration testing. Use sanitized fixtures and disposable test accounts.
