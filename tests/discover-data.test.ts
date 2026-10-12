import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { genreAfterSwitch, genreCatalogs, genresFor, isGenreFor, tmdbMovieGenres, tmdbTvGenres } from "../src/lib/media/genres";
import { GoogleBooksProvider, isFiction, isUsableVolume, normalizeGoogleBook } from "../src/lib/media/providers/google-books";
import { IgdbProvider } from "../src/lib/media/providers/igdb";
import { mockCatalogProvider } from "../src/lib/media/providers/mock";
import { releaseFits, TmdbProvider } from "../src/lib/media/providers/tmdb";
import { communityRatingFor, describeCommunityRating, formatCommunityRating, normalizeCommunityRating } from "../src/lib/media/ratings";
import { buildRecommendations, recommendationSeeds } from "../src/lib/media/recommendations";
import { discoveryRegion, fallbackRegion, releaseWindows } from "../src/lib/media/region";
import { findTheme } from "../src/lib/media/themes";
import type { CatalogMedia, CatalogMovie, CatalogProvider, CatalogSeries } from "../src/lib/media/types";
import { emptyMosaicState, type MosaicState } from "../src/lib/persistence/types";

// "server-only" is resolved by Next's bundler; map it to Next's empty stub so Node can load catalog.ts.
const moduleWithResolver = Module as unknown as { _resolveFilename(request: string, ...rest: unknown[]): string };
const resolve = moduleWithResolver._resolveFilename;
moduleWithResolver._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolve.call(this, request === "server-only" ? "next/dist/compiled/server-only/empty.js" : request, ...rest);
};
const loadCatalog = () => import("../src/lib/media/catalog");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** A fetch double that records requested URLs and answers from `respond`. */
function recorder(respond: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); return respond(url); }) as typeof fetch;
  return { urls, fetcher };
}
const igdbProvider = (respond: (body: string) => Response) => {
  const bodies: string[] = [];
  const provider = new IgdbProvider("client", "secret", (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("oauth2")) return json({ access_token: "token", expires_in: 3600 });
    bodies.push(String(init?.body));
    return respond(String(init?.body));
  }) as typeof fetch);
  return { provider, bodies };
};

// ── Community ratings ─────────────────────────────────────────────────────────────────────────────

test("community ratings convert every provider's native scale to /10 with its source", () => {
  assert.deepEqual(normalizeCommunityRating(7.84, 10, "tmdb", 2310), { value: 7.8, source: "tmdb", count: 2310 });
  assert.deepEqual(normalizeCommunityRating(92.4, 100, "igdb"), { value: 9.2, source: "igdb" });
  assert.deepEqual(normalizeCommunityRating(4.5, 5, "googlebooks", 12), { value: 9, source: "googlebooks", count: 12 });
  // Stored snapshot conventions: TMDB as-is, IGDB rating/20, Google Books as-is, mock 0–5.
  const base = { providerId: "1", title: "T", genres: [] };
  assert.equal(communityRatingFor({ ...base, provider: "tmdb", mediaType: "movie", communityRating: 7.8 })?.value, 7.8);
  assert.equal(communityRatingFor({ ...base, provider: "igdb", mediaType: "game", platforms: [], communityRating: 92 / 20 })?.value, 9.2);
  assert.equal(communityRatingFor({ ...base, provider: "googlebooks", mediaType: "book", authors: [], communityRating: 3.5 })?.value, 7);
  assert.equal(communityRatingFor({ ...base, provider: "mock", mediaType: "movie", communityRating: 4.6 })?.value, 9.2);
});

test("community ratings handle bounds, zero, missing and invalid values distinctly", () => {
  assert.deepEqual(normalizeCommunityRating(10, 10, "tmdb"), { value: 10, source: "tmdb" });
  assert.deepEqual(normalizeCommunityRating(100, 100, "igdb"), { value: 10, source: "igdb" });
  assert.deepEqual(normalizeCommunityRating(1, 5, "googlebooks"), { value: 2, source: "googlebooks" });
  assert.deepEqual(normalizeCommunityRating(0, 10, "tmdb", 3), { value: 0, source: "tmdb", count: 3 }); // a real zero
  assert.equal(normalizeCommunityRating(0, 10, "tmdb", 0), undefined); // nobody voted
  assert.equal(normalizeCommunityRating(0, 10, "tmdb"), undefined);
  for (const invalid of [undefined, null, "7.5", Number.NaN, Number.POSITIVE_INFINITY, -0.1, 10.01]) assert.equal(normalizeCommunityRating(invalid, 10, "tmdb"), undefined);
  assert.equal(normalizeCommunityRating(5.5, 5, "googlebooks"), undefined);
  assert.deepEqual(normalizeCommunityRating(8, 10, "tmdb", 2.5), { value: 8, source: "tmdb" }); // a non-integer count is dropped
});

test("community ratings format to one decimal and describe source and count", () => {
  const rating = normalizeCommunityRating(8, 10, "tmdb", 1234)!;
  assert.equal(formatCommunityRating(rating), "8.0");
  assert.equal(describeCommunityRating(rating), "Community rating 8.0 out of 10 on TMDB from 1,234 ratings");
  assert.equal(describeCommunityRating(normalizeCommunityRating(4, 5, "googlebooks", 1)!), "Community rating 8.0 out of 10 on Google Books from 1 rating");
  assert.equal(describeCommunityRating(normalizeCommunityRating(81, 100, "igdb")!), "Community rating 8.1 out of 10 on IGDB");
});

// ── Genres ────────────────────────────────────────────────────────────────────────────────────────

test("movies, series and games each use their own provider genre list", () => {
  assert.equal(genresFor("movie"), genreCatalogs.movie);
  assert.equal(genresFor("tv")?.genres, tmdbTvGenres);
  assert.equal(genresFor("game")?.provider, "igdb");
  assert.equal(genresFor("book"), undefined);
  assert.equal(genresFor(null)?.mediaType, "movie");
  assert.equal(isGenreFor("movie", 28), true);
  assert.equal(isGenreFor("tv", 28), false); // Action is movie-only; series use 10759
  assert.equal(isGenreFor("tv", 10765), true);
  assert.equal(isGenreFor("movie", 10765), false);
  assert.equal(isGenreFor("game", 12), true);
  assert.ok(tmdbMovieGenres.length === 19 && tmdbTvGenres.length === 16);
});

test("a selected genre survives a tab switch only when it is the same provider genre", () => {
  assert.equal(genreAfterSwitch(18, "movie", "tv"), 18); // Drama exists in both TMDB lists
  assert.equal(genreAfterSwitch(28, "movie", "tv"), undefined);
  assert.equal(genreAfterSwitch(12, "movie", "game"), undefined); // TMDB 12 (Adventure) ≠ IGDB 12 (RPG)
  assert.equal(genreAfterSwitch(18, null, "movie"), 18);
  assert.equal(genreAfterSwitch(12, "game", "book"), undefined);
  assert.equal(genreAfterSwitch(undefined, "movie", "tv"), undefined);
});

test("TMDB sends series genres to TV discovery and never a movie genre", async () => {
  const { urls, fetcher } = recorder(() => json({ results: [{ id: 7, name: "Show", genre_ids: [10765] }] }));
  const tmdb = new TmdbProvider("token", fetcher);
  const items = await tmdb.discoverByGenre("tv", 10765);
  assert.match(urls[0], /\/discover\/tv\?with_genres=10765/);
  assert.deepEqual(items.map(({ mediaType, genres }) => [mediaType, genres]), [["tv", ["Sci-Fi & Fantasy"]]]);
  assert.deepEqual(await tmdb.discoverByGenre("tv", 28), []);
  assert.deepEqual(await tmdb.discoverByGenre("game", 12), []);
  assert.equal(urls.length, 1);
});

test("IGDB filters games by IGDB genre IDs and rejects other IDs", async () => {
  const { provider, bodies } = igdbProvider(() => json([{ id: 1, name: "RPG", rating: 80 }]));
  assert.deepEqual((await provider.discoverByGenre("game", 12)).map(({ title }) => title), ["RPG"]);
  assert.match(bodies[0], /where genres = \(12\) & version_parent = null/);
  assert.deepEqual(await provider.discoverByGenre("game", 28), []);
  assert.equal(bodies.length, 1);
});

test("genre discovery reports provider failures instead of an empty genre", async () => {
  const { discoverGenre } = await loadCatalog();
  const failing: CatalogProvider = { name: "tmdb", search: async () => [], getById: async () => null, discoverByGenre: async () => { throw new Error("timeout"); } };
  const result = await discoverGenre("movie", 28, [failing]);
  assert.deepEqual([result.items, result.failures.length], [[], 1]);
  const mock = await discoverGenre("tv", 9648, [mockCatalogProvider]);
  assert.ok(mock.items.length > 0 && mock.items.every((item) => item.mediaType === "tv" && item.genres.includes("Mystery")));
});

// ── Google Books ──────────────────────────────────────────────────────────────────────────────────

test("Google Books volumes are validated and partial records are never filled in", () => {
  assert.equal(isUsableVolume({ id: "a", volumeInfo: { title: "Title" } }), true);
  for (const bad of [null, {}, { id: "", volumeInfo: { title: "T" } }, { id: "a" }, { id: "a", volumeInfo: { title: "  " } }, { id: 5, volumeInfo: { title: "T" } }]) assert.equal(isUsableVolume(bad), false);
  const sparse = normalizeGoogleBook({ id: "sparse", volumeInfo: { title: "Sparse", authors: ["A", 4 as unknown as string, ""], categories: "Fiction" as unknown as string[], publishedDate: "" } });
  assert.deepEqual([sparse.authors, sparse.genres, sparse.releaseDate, sparse.releaseYear, sparse.posterUrl, sparse.description, sparse.communityRating], [["A"], [], undefined, undefined, undefined, undefined, undefined]);
  assert.equal(isFiction({ ...sparse, genres: ["Juvenile Fiction"] }), true);
  assert.equal(isFiction({ ...sparse, genres: ["Juvenile Nonfiction"] }), false);
  assert.equal(isFiction({ ...sparse, genres: ["Library catalogs"] }), false);
});

test("an empty Google Books answer moves to the next query and keeps only fiction", async () => {
  const { urls, fetcher } = recorder((url) => new URL(url).searchParams.get("q") === "subject:fiction"
    ? json({ totalItems: 0 })
    : json({ items: [
      { id: "novel", volumeInfo: { title: "A Novel", categories: ["Fiction"], authors: ["Writer"], averageRating: 4, ratingsCount: 9 } },
      { id: "catalogue", volumeInfo: { title: "Catalogue of Fiction", categories: ["Library catalogs"] } },
      { volumeInfo: { title: "No identifier" } },
    ] }));
  const [section] = await new GoogleBooksProvider("key", fetcher).discoverSections();
  assert.deepEqual(urls.map((url) => new URL(url).searchParams.get("q")), ["subject:fiction", "fiction novel"]);
  assert.deepEqual(section.items.map(({ providerId, mediaType }) => [providerId, mediaType]), [["novel", "book"]]);
  assert.equal(section.error, undefined);
  assert.equal(communityRatingFor(section.items[0])?.value, 8);
});

test("Google Books failure and genuine emptiness are distinguishable", async () => {
  const failed = await new GoogleBooksProvider("key", async () => new Response("down", { status: 400 })).discoverSections();
  assert.deepEqual([failed[0].items, typeof failed[0].error], [[], "string"]);
  const empty = await new GoogleBooksProvider("key", async () => json({ totalItems: 0 })).discoverSections();
  assert.deepEqual([empty[0].items, empty[0].error], [[], undefined]);
});

test("Google Books stops after the first query with fiction results", async () => {
  const { urls, fetcher } = recorder(() => json({ items: [{ id: "f", volumeInfo: { title: "F", categories: ["Fiction"] } }] }));
  await new GoogleBooksProvider("key", fetcher).discoverSections();
  assert.equal(urls.length, 1);
});

// ── Region and release windows ────────────────────────────────────────────────────────────────────

test("release region prefers the account, then the browser, then the documented fallback", () => {
  assert.equal(discoveryRegion("GB", "IN"), "GB");
  assert.equal(discoveryRegion(undefined, "IN"), "IN");
  assert.equal(discoveryRegion(null, null), fallbackRegion);
  assert.equal(discoveryRegion("gb", "india"), "US");
});

test("release windows are whole UTC days across month, year and leap boundaries", () => {
  assert.deepEqual(releaseWindows("2026-10-12"), { nowPlaying: { from: "2026-09-01", to: "2026-10-12" }, upcoming: { from: "2026-10-13", to: "2027-01-10" } });
  assert.deepEqual(releaseWindows("2026-12-31").upcoming.from, "2027-01-01");
  assert.deepEqual(releaseWindows("2028-03-01").nowPlaying.from, "2028-01-20");
  assert.deepEqual(releaseWindows("2028-02-28").upcoming.from, "2028-02-29");
});

test("TMDB release rails query the region's theatrical dates and drop titles outside the window", async () => {
  const { urls, fetcher } = recorder((url) => json({ results: url.includes("release_date.gte=2026-10-13")
    ? [{ id: 1, title: "Out already (limited)", release_date: "2026-10-04" }, { id: 2, title: "Soon", release_date: "2026-10-20" }, { id: 3, title: "No date" }]
    : [{ id: 4, title: "Playing", release_date: "2026-10-12" }, { id: 5, title: "Not yet", release_date: "2026-10-13" }] }));
  const sections = await new TmdbProvider("token", fetcher).discoverSections({ region: "GB", today: "2026-10-12" });
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
  assert.ok(urls.some((url) => url.includes("/discover/movie?region=GB&with_release_type=2%7C3&release_date.gte=2026-09-01&release_date.lte=2026-10-12")));
  assert.ok(urls.some((url) => url.includes("region=GB&with_release_type=2%7C3&release_date.gte=2026-10-13&release_date.lte=2027-01-10")));
  assert.deepEqual(byId["tmdb-movie-upcoming"].items.map(({ title }) => title), ["Soon"]);
  assert.deepEqual(byId["tmdb-movie-now-playing"].items.map(({ title }) => title), ["Playing"]);
  assert.equal(byId["tmdb-movie-upcoming"].region, "GB");
  assert.equal(byId["tmdb-movie-trending"].region, undefined);
  assert.equal(releaseFits("movie-upcoming", "2026-10-12", "2026-10-12"), false);
  assert.equal(releaseFits("movie-now-playing", "not-a-date", "2026-10-12"), false);
  assert.equal(releaseFits("movie-trending", undefined, "2026-10-12"), true);
});

test("discoverCatalog validates the region and falls back deterministically", async () => {
  const { discoverCatalog } = await loadCatalog();
  const seen: unknown[] = [];
  const provider: CatalogProvider = { name: "tmdb", search: async () => [], getById: async () => null, discoverSections: async (options) => { seen.push(options); return []; } };
  await discoverCatalog({ region: "gb; drop", today: "2026-10-12" }, [provider]);
  await discoverCatalog({ region: "IN", today: "2026-10-12" }, [provider]);
  assert.deepEqual(seen, [{ region: "US", today: "2026-10-12" }, { region: "IN", today: "2026-10-12" }]);
});

// ── Because you watched ───────────────────────────────────────────────────────────────────────────

const movie = (id: string, provider: CatalogMovie["provider"] = "tmdb"): CatalogMovie => ({ provider, providerId: id, mediaType: "movie", title: id, genres: [] });
const series = (id: string): CatalogSeries => ({ provider: "tmdb", providerId: id, mediaType: "tv", title: id, genres: [] });
function historyState(): MosaicState {
  const state = emptyMosaicState();
  state.movieWatches.push(
    { id: "w1", media: movie("old"), watchedAt: "2026-08-01", isRewatch: false },
    { id: "w2", media: movie("recent"), watchedAt: "2026-10-01", isRewatch: false },
    { id: "w3", media: movie("recent"), watchedAt: "2026-09-01", isRewatch: true },
    { id: "w4", media: movie("disliked"), watchedAt: "2026-10-05", isRewatch: false },
  );
  state.episodeWatches.push({ id: "e1", series: series("show"), seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-10-03T20:00:00.000Z" });
  state.ratings.push({ mediaKey: "tmdb:movie:disliked", value: 1.5, updatedAt: "2026-10-05T00:00:00.000Z" });
  // Library status, game progress and book reading are not watch history and never seed.
  state.library.push({ media: movie("saved-only"), status: "watchlist", isFavorite: true, updatedAt: "2026-10-10T00:00:00.000Z" });
  state.gamePlaythroughs.push({ id: "g", media: { provider: "igdb", providerId: "game", mediaType: "game", title: "Game", genres: [], platforms: [] }, status: "playing", updatedAt: "2026-10-11T00:00:00.000Z" } as unknown as MosaicState["gamePlaythroughs"][number]);
  return state;
}

test("recommendation seeds come only from logged watches, most recent first and bounded", () => {
  const state = historyState();
  assert.deepEqual(recommendationSeeds(state, null).map(({ media }) => media.providerId), ["show", "recent", "old"]);
  assert.deepEqual(recommendationSeeds(state, "movie").map(({ media }) => media.providerId), ["recent", "old"]);
  assert.deepEqual(recommendationSeeds(state, null, 1).map(({ media }) => media.providerId), ["show"]);
  assert.deepEqual(recommendationSeeds(state, "game"), []);
  assert.deepEqual(recommendationSeeds(state, "book"), []);
  assert.deepEqual(recommendationSeeds(emptyMosaicState(), null), []); // new user: nothing invented
});

test("seeds read only the state they are given, so one account never sees another's history", () => {
  const owner = historyState();
  const other = emptyMosaicState();
  assert.ok(recommendationSeeds(owner, null).length > 0);
  assert.deepEqual(recommendationSeeds(other, null), []);
});

test("recommendations exclude tracked titles, dedupe across seeds and keep the seed that explains them", () => {
  const state = historyState();
  const seeds = recommendationSeeds(state, "movie");
  const shared = movie("shared");
  const results: Array<CatalogMedia[] | null> = [[shared, movie("saved-only"), movie("old"), movie("new-a")], [shared, movie("new-b")]];
  const recommendations = buildRecommendations(seeds, results, state);
  assert.deepEqual(recommendations.map(({ seed, items }) => [seed.providerId, items.map(({ providerId }) => providerId)]), [["recent", ["shared", "new-a"]], ["old", ["new-b"]]]);
  assert.equal(state.library.length, 1); // exclusion never touches tracking records
});

test("failed or empty seed requests drop out without inventing results", () => {
  const state = historyState();
  const seeds = recommendationSeeds(state, "movie");
  assert.deepEqual(buildRecommendations(seeds, [null, []], state), []);
  assert.deepEqual(buildRecommendations(seeds, [null, [movie("x")]], state).map(({ seed }) => seed.providerId), ["old"]);
});

// ── Themes ────────────────────────────────────────────────────────────────────────────────────────

test("themes query provider keyword and theme metadata for each medium", async () => {
  const tmdb = recorder(() => json({ results: [{ id: 1, title: "Heist movie" }] }));
  await new TmdbProvider("token", tmdb.fetcher).discoverByTheme("movie", findTheme("cosmic-horror")!);
  assert.match(tmdb.urls[0], /\/discover\/movie\?with_keywords=215959%7C287274&/);
  const igdb = igdbProvider(() => json([{ id: 1, name: "Detective game" }]));
  await igdb.provider.discoverByTheme("game", findTheme("mystery")!);
  assert.match(igdb.bodies[0], /where \(keywords = \(215\) \| themes = \(43\)\) & version_parent = null/);
  assert.deepEqual(await igdb.provider.discoverByTheme("game", findTheme("courtroom")!), []);
  const books = recorder(() => json({ items: [{ id: "n", volumeInfo: { title: "Vault", categories: ["Fiction"] } }, { id: "x", volumeInfo: { title: "Heists, a history", categories: ["True Crime"] } }] }));
  const found = await new GoogleBooksProvider("key", books.fetcher).discoverByTheme("book", findTheme("heist")!);
  assert.equal(new URL(books.urls[0]).searchParams.get("q"), "heist thriller novel");
  assert.deepEqual(found.map(({ providerId }) => providerId), ["n"]);
});

test("theme discovery dedupes, caps each medium in All, and reports failures and unsupported media", async () => {
  const { discoverTheme } = await loadCatalog();
  const many = Array.from({ length: 10 }, (_, index) => movie(`m${index}`));
  const tmdb: CatalogProvider = { name: "tmdb", search: async () => [], getById: async () => null, discoverByTheme: async (type) => type === "movie" ? [...many, many[0]] : [] };
  const igdb: CatalogProvider = { name: "igdb", search: async () => [], getById: async () => null, discoverByTheme: async () => { throw new Error("rate limited"); } };
  const books: CatalogProvider = { name: "googlebooks", search: async () => [], getById: async () => null, discoverByTheme: async () => [] };
  const all = await discoverTheme(findTheme("heist")!, null, [tmdb, igdb, books]);
  assert.equal(all.items.length, 6);
  assert.deepEqual(all.failures.map(({ provider }) => provider), ["igdb"]);
  const movies = await discoverTheme(findTheme("heist")!, "movie", [tmdb, igdb, books]);
  assert.equal(movies.items.length, 10); // the duplicate is removed
  const unsupported = await discoverTheme(findTheme("courtroom")!, "game", [tmdb, igdb, books]);
  assert.deepEqual([unsupported.items, unsupported.unsupported], [[], true]);
});

test("theme responses are cached at the edge only when every provider answered", async () => {
  const { GET } = await import("../src/app/api/catalog/themes/route");
  const response = await GET(new Request("http://localhost/api/catalog/themes?theme=mystery&type=tv"));
  const body = await response.json() as { items: CatalogMedia[]; failures: unknown[] };
  assert.equal(response.headers.get("Cache-Control"), "public, s-maxage=3600, stale-while-revalidate=86400");
  assert.ok(body.items.length > 0 && body.items.every((item) => item.mediaType === "tv"));
  assert.equal((await GET(new Request("http://localhost/api/catalog/themes?theme=nope"))).status, 404);
  assert.equal((await GET(new Request("http://localhost/api/catalog/themes?theme=mystery&type=film"))).status, 400);
});
