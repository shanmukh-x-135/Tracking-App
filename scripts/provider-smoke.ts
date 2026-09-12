import { getServerEnvironment } from "../src/lib/config/env";
import { GoogleBooksProvider } from "../src/lib/media/providers/google-books";
import { IgdbProvider } from "../src/lib/media/providers/igdb";
import { TmdbProvider } from "../src/lib/media/providers/tmdb";
import type { CatalogMedia, CatalogProvider } from "../src/lib/media/types";

interface SmokeCase {
  label: string;
  provider: CatalogProvider;
  query: string;
  accepts(media: CatalogMedia): boolean;
}

async function verify({ label, provider, query, accepts }: SmokeCase): Promise<void> {
  const results = await provider.search(query);
  const match = results.find(accepts);
  if (!match) throw new Error(`${label} search returned no compatible result.`);
  const detail = await provider.getById(match.providerId, match.mediaType);
  if (!detail || detail.providerId !== match.providerId) throw new Error(`${label} detail lookup failed.`);
  console.log(`${label}: search and detail lookup passed (${detail.title}).`);
}

async function main(): Promise<void> {
  const environment = getServerEnvironment();
  const missing = [
    ["TMDB_API_READ_TOKEN", environment.tmdbToken],
    ["IGDB_CLIENT_ID", environment.igdbClientId],
    ["IGDB_CLIENT_SECRET", environment.igdbClientSecret],
    ["GOOGLE_BOOKS_API_KEY", environment.googleBooksApiKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing provider credentials: ${missing.join(", ")}`);

  const cases: SmokeCase[] = [
    { label: "TMDB movies", provider: new TmdbProvider(environment.tmdbToken), query: "Dune", accepts: (media) => media.mediaType === "movie" },
    { label: "TMDB series", provider: new TmdbProvider(environment.tmdbToken), query: "Severance", accepts: (media) => media.mediaType === "tv" },
    { label: "IGDB games", provider: new IgdbProvider(environment.igdbClientId, environment.igdbClientSecret), query: "Hades", accepts: (media) => media.mediaType === "game" },
    { label: "Google Books", provider: new GoogleBooksProvider(environment.googleBooksApiKey), query: "Dune Frank Herbert", accepts: (media) => media.mediaType === "book" },
  ];

  for (const smokeCase of cases) await verify(smokeCase);
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : "Provider smoke tests failed.");
  process.exitCode = 1;
});
