import assert from "node:assert/strict";
import test from "node:test";
import { createLibraryGetHandler, parseLibraryRequest } from "../src/lib/api/library-contract";
import { projectLibraryEntries, type MobileLibraryEntry } from "../src/lib/library/projection";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { CatalogBook, CatalogGame, CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { provider: "mock", providerId: "movie", mediaType: "movie", title: "Movie", posterUrl: "https://art.test/movie.jpg", genres: [], releaseYear: 2020 };
const series: CatalogSeries = { provider: "mock", providerId: "series", mediaType: "tv", title: "Series", posterUrl: "https://art.test/series.jpg", backdropUrl: "https://art.test/series-wide.jpg", genres: [], eligibleEpisodeCount: 8, seasonEpisodeCounts: { 1: 8 } };
const unknownSeries: CatalogSeries = { provider: "mock", providerId: "unknown-series", mediaType: "tv", title: "Unknown series", genres: [] };
const game: CatalogGame = { provider: "mock", providerId: "game", mediaType: "game", title: "Game", posterUrl: "https://art.test/game.jpg", genres: [], platforms: ["PC"] };
const book: CatalogBook = { provider: "mock", providerId: "book", mediaType: "book", title: "Book", posterUrl: "https://art.test/book.jpg", genres: [], authors: ["Author"] };

test("mobile Library projection includes complete tracked states, not only active media", () => {
  const state = emptyMosaicState();
  state.library = [
    { media: movie, status: "watched", isFavorite: true, updatedAt: "2026-04-01T00:00:00.000Z" },
    { media: series, status: "completed", isFavorite: false, updatedAt: "2026-04-04T00:00:00.000Z" },
    { media: unknownSeries, status: "paused", isFavorite: false, updatedAt: "2026-04-03T00:00:00.000Z" },
    { media: book, status: "finished", isFavorite: false, updatedAt: "2026-04-02T00:00:00.000Z" },
    { media: game, status: "dropped", isFavorite: false, updatedAt: "2026-04-05T00:00:00.000Z" },
  ];
  state.ratings = [{ mediaKey: "mock:movie:movie", value: 4.5, updatedAt: "2026-04-01T00:00:00.000Z" }];
  state.episodeWatches = [{ id: "episode", series, seasonNumber: 1, episodeNumber: 2, watchedAt: "2026-04-04T00:00:00.000Z" }];
  state.bookReadings = [{ id: "book", media: book, status: "finished", currentPage: 400, totalPages: 400, updatedAt: "2026-04-02T00:00:00.000Z" }];
  state.gamePlaythroughs = [{ id: "game", media: game, status: "dropped", playtimeMinutes: 85, progressPercent: undefined, updatedAt: "2026-04-05T00:00:00.000Z" }];

  const items = projectLibraryEntries(state);
  assert.deepEqual(items.map((item) => item.id), ["mock:game:game", "mock:tv:series", "mock:tv:unknown-series", "mock:book:book", "mock:movie:movie"]);
  assert.deepEqual(items.map((item) => item.status), ["dropped", "completed", "paused", "finished", "watched"]);
  assert.equal(items.find((item) => item.id === "mock:movie:movie")?.userRating, 4.5);
  assert.equal(items.find((item) => item.id === "mock:movie:movie")?.posterUrl, "https://art.test/movie.jpg");
  assert.deepEqual(items.find((item) => item.id === "mock:tv:series")?.progress, { watchedEpisodes: 1, totalEpisodes: 8, percent: 13, nextSeasonNumber: 1, nextEpisodeNumber: 3 });
  assert.deepEqual(items.find((item) => item.id === "mock:tv:unknown-series")?.progress, { watchedEpisodes: 0, totalEpisodes: null, percent: null });
  assert.deepEqual(items.find((item) => item.id === "mock:book:book")?.progress, { currentPage: 400, totalPages: 400, percent: 100 });
  assert.deepEqual(items.find((item) => item.id === "mock:game:game")?.progress, { playtimeMinutes: 85, percent: null });
});

test("Library projection filters the full collection and applies documented sorts", () => {
  const state = emptyMosaicState();
  state.library = [
    { media: movie, status: "watchlist", isFavorite: false, updatedAt: "2026-04-01T00:00:00.000Z" },
    { media: series, status: "watching", isFavorite: false, updatedAt: "2026-04-03T00:00:00.000Z" },
    { media: book, status: "want_to_read", isFavorite: false, updatedAt: "2026-04-02T00:00:00.000Z" },
    { media: game, status: "backlog", isFavorite: false, updatedAt: "2026-04-02T12:00:00.000Z" },
  ];
  state.ratings = [{ mediaKey: "mock:movie:movie", value: 5, updatedAt: "2026-04-01T00:00:00.000Z" }];
  assert.deepEqual(projectLibraryEntries(state, { mediaType: "movie" }).map((item) => item.id), ["mock:movie:movie"]);
  assert.deepEqual(projectLibraryEntries(state, { status: "watching" }).map((item) => item.id), ["mock:tv:series"]);
  assert.deepEqual(projectLibraryEntries(state, { sort: "rating" }).map((item) => item.id), ["mock:movie:movie", "mock:tv:series", "mock:game:game", "mock:book:book"]);
  assert.equal(projectLibraryEntries(state).find((item) => item.id === "mock:book:book")?.progress, undefined);
  assert.equal(projectLibraryEntries(state).find((item) => item.id === "mock:game:game")?.progress, undefined);
});

test("Library HTTP contract requires auth and rejects invalid filters and sorts", async () => {
  const unauthenticated = createLibraryGetHandler({ getAuthenticatedUser: async () => undefined, getLibrary: async () => [] });
  const denied = await unauthenticated(new Request("https://mosaic.test/api/me/library"));
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: { code: "UNAUTHORIZED", message: "Authentication required." } });

  const invalidType = parseLibraryRequest(new Request("https://mosaic.test/api/me/library?type=series"));
  assert.ok(invalidType instanceof Response);
  assert.equal(invalidType.status, 400);
  const invalidSort = parseLibraryRequest(new Request("https://mosaic.test/api/me/library?sort=newest"));
  assert.ok(invalidSort instanceof Response);
  assert.equal(invalidSort.status, 400);

  const entry: MobileLibraryEntry = { id: "mock:movie:movie", mediaType: "movie", provider: "mock", providerId: "movie", title: "Movie", status: "watched", userRating: null, isFavorite: false, updatedAt: "2026-04-01T00:00:00.000Z" };
  let options: object | undefined;
  const authenticated = createLibraryGetHandler({
    getAuthenticatedUser: async () => ({ id: "user", client: "client" }),
    getLibrary: async (_client, _userId, receivedOptions) => { options = receivedOptions; return [entry]; },
  });
  const response = await authenticated(new Request("https://mosaic.test/api/me/library?type=movie&status=watched&sort=title"));
  assert.equal(response.status, 200);
  assert.deepEqual(options, { mediaType: "movie", status: "watched", sort: "title" });
  assert.deepEqual(await response.json(), { items: [entry] });

  const failed = createLibraryGetHandler({ getAuthenticatedUser: async () => ({ id: "user", client: "client" }), getLibrary: async () => { throw new Error("database details"); } });
  const failure = await failed(new Request("https://mosaic.test/api/me/library"));
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: { code: "INTERNAL_ERROR", message: "Your library could not be loaded." } });
});
