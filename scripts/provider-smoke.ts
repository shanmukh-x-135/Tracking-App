import assert from "node:assert/strict";
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
  validate?(media: CatalogMedia): void;
}

function validateBase(media: CatalogMedia): void {
  assert.ok(media.title.trim(), "title is required");
  assert.ok(media.providerId.trim(), "provider identity is required");
  assert.ok(media.description?.trim(), `${media.title} should include a description`);
  assert.ok(media.releaseYear && media.releaseYear > 1800, `${media.title} should include a credible release year`);
  assert.ok(media.genres.length > 0, `${media.title} should include genres`);
}

async function verify({ label, provider, query, accepts, validate }: SmokeCase): Promise<CatalogMedia> {
  const results = await provider.search(query);
  const match = results.find(accepts);
  if (!match) throw new Error(`${label} search returned no compatible result.`);
  const detail = await provider.getById(match.providerId, match.mediaType);
  if (!detail || detail.providerId !== match.providerId) throw new Error(`${label} detail lookup failed.`);
  validateBase(detail);
  validate?.(detail);
  console.log(`${label}: search and detail lookup passed (${detail.title}).`);
  return detail;
}

async function retryingFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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

  let tokenRequests = 0;
  const igdbFetch: typeof fetch = async (input, init) => {
    if (String(input).startsWith("https://id.twitch.tv/oauth2/token")) tokenRequests += 1;
    return retryingFetch(input, init);
  };
  const tmdb = new TmdbProvider(environment.tmdbToken, retryingFetch);
  const igdb = new IgdbProvider(environment.igdbClientId, environment.igdbClientSecret, igdbFetch);
  const googleBooks = new GoogleBooksProvider(environment.googleBooksApiKey, retryingFetch);

  const cases: SmokeCase[] = [
    { label: "TMDB modern movie", provider: tmdb, query: "Dune Part Two", accepts: (media) => media.mediaType === "movie" && media.title === "Dune: Part Two", validate: (media) => { assert.ok(media.posterUrl && media.backdropUrl); assert.ok(media.mediaType === "movie" && media.runtimeMinutes); assert.ok(media.originalTitle); } },
    { label: "TMDB older movie", provider: tmdb, query: "Casablanca", accepts: (media) => media.mediaType === "movie" && media.title === "Casablanca", validate: (media) => { assert.ok(media.posterUrl && media.backdropUrl); assert.ok(media.mediaType === "movie" && media.director); } },
    { label: "TMDB recent series", provider: tmdb, query: "Severance", accepts: (media) => media.mediaType === "tv" && media.title === "Severance" && media.releaseYear === 2022, validate: (media) => { assert.ok(media.posterUrl && media.backdropUrl); assert.ok(media.mediaType === "tv" && media.seasonCount && media.episodeCount); } },
    { label: "TMDB older series", provider: tmdb, query: "Twin Peaks", accepts: (media) => media.mediaType === "tv" && media.title === "Twin Peaks", validate: (media) => { assert.ok(media.mediaType === "tv" && media.seasonCount && media.episodeCount); } },
    { label: "IGDB modern game", provider: igdb, query: "Hades", accepts: (media) => media.mediaType === "game" && media.title === "Hades" && media.releaseYear === 2020, validate: (media) => { assert.ok(media.posterUrl && media.backdropUrl); assert.ok(media.mediaType === "game" && media.developer && media.publisher && media.platforms.length > 1); } },
    { label: "IGDB older game", provider: igdb, query: "Dune II", accepts: (media) => media.mediaType === "game" && media.title.startsWith("Dune II") && media.releaseYear === 1992, validate: (media) => { assert.ok(media.mediaType === "game" && media.platforms.length > 1); } },
    { label: "IGDB multi-platform game", provider: igdb, query: "The Witcher 3 Wild Hunt", accepts: (media) => media.mediaType === "game" && media.title === "The Witcher 3: Wild Hunt", validate: (media) => { assert.ok(media.mediaType === "game" && media.platforms.length >= 3); } },
    { label: "Google Books modern book", provider: googleBooks, query: "Tomorrow and Tomorrow and Tomorrow Gabrielle Zevin", accepts: (media) => media.mediaType === "book" && media.title === "Tomorrow, and Tomorrow, and Tomorrow", validate: (media) => { assert.ok(media.posterUrl); assert.ok(media.mediaType === "book" && media.authors.some((author) => author.includes("Zevin"))); assert.doesNotMatch(media.description ?? "", /<[^>]+>/); } },
    { label: "Google Books classic", provider: googleBooks, query: "Pride and Prejudice Jane Austen", accepts: (media) => media.mediaType === "book" && media.title.includes("Pride and Prejudice"), validate: (media) => { assert.ok(media.mediaType === "book" && media.authors.some((author) => author.includes("Austen"))); } },
  ];

  for (const smokeCase of cases) {
    try {
      await verify(smokeCase);
    } catch (error) {
      throw new Error(`${smokeCase.label}: ${error instanceof Error ? error.message : "validation failed"}`, { cause: error });
    }
  }

  const sharedTitleMovies = (await tmdb.search("The Thing")).filter((media) => media.mediaType === "movie" && media.title === "The Thing");
  assert.ok(sharedTitleMovies.length >= 2, "TMDB should preserve distinct shared-title movie identities");
  const sparseTmdb = await tmdb.search("Severance");
  assert.ok(sparseTmdb.some((media) => !media.posterUrl || !media.backdropUrl), "TMDB sparse-artwork fallback case was not found");
  const duneResults = await googleBooks.search("Dune Frank Herbert");
  const duneEditions = duneResults.filter((media) => media.mediaType === "book" && media.title === "Dune");
  assert.ok(duneEditions.length >= 2, "Google Books should preserve multiple Dune editions");
  assert.ok(duneResults.some((media) => media.mediaType === "book" && (!media.posterUrl || !media.pageCount)), "Google Books incomplete-metadata fallback case was not found");
  assert.equal(tokenRequests, 1, "IGDB should reuse its app token during the smoke run");
  console.log("Provider edge cases: shared titles, sparse artwork, incomplete book metadata, editions, and IGDB token caching passed.");
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : "Provider smoke tests failed.");
  process.exitCode = 1;
});
