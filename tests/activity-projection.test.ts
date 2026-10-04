import assert from "node:assert/strict";
import test from "node:test";
import { projectActivity } from "../src/lib/activity/projection";
import { deriveContinue } from "../src/lib/home/continue";
import { deriveAnalytics, deriveTvMetrics } from "../src/lib/analytics/derive";
import { deriveCurrentMediaState } from "../src/lib/persistence/current-media-state";
import { projectContinueItems } from "../src/lib/current-media/projection";
import { catalogMediaSchema } from "../src/lib/persistence/validation";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { CatalogBook, CatalogGame, CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { provider: "mock", providerId: "movie", mediaType: "movie", title: "Movie", genres: [] };
const series: CatalogSeries = { provider: "mock", providerId: "series", mediaType: "tv", title: "Series", genres: [], episodeCount: 10, eligibleEpisodeCount: 8, seasonEpisodeCounts: { 1: 3, 2: 5, 3: 2 } };
const game: CatalogGame = { provider: "mock", providerId: "game", mediaType: "game", title: "Game", genres: [], platforms: ["PC"] };
const book: CatalogBook = { provider: "mock", providerId: "book", mediaType: "book", title: "Book", genres: [], authors: [], pageCount: 400 };

test("persisted series metadata retains the released-episode denominator used by Home and Library", () => {
  const parsed = catalogMediaSchema.parse(series);
  assert.equal(parsed.mediaType, "tv");
  if (parsed.mediaType === "tv") {
    assert.deepEqual(parsed.seasonEpisodeCounts, { 1: 3, 2: 5, 3: 2 });
    assert.equal(parsed.eligibleEpisodeCount, 8);
  }
});

test("activity projection is chronological, domain-aware, and contains no fabricated events", () => {
  const state = emptyMosaicState();
  state.movieWatches = [{ id: "movie-watch", media: movie, watchedAt: "2026-01-01", isRewatch: false, rating: 4.5 }];
  state.episodeWatches = [{ id: "episode-watch", series, seasonNumber: 2, episodeNumber: 4, episodeTitle: "Consequence", watchedAt: "2026-01-04T12:00:00.000Z", rating: 3.5 }];
  state.gamePlaythroughs = [{ id: "game-playthrough", media: game, status: "playing", platform: "PC", playtimeMinutes: 180, progressPercent: 25, updatedAt: "2026-01-03T12:00:00.000Z" }];
  state.bookReadings = [{ id: "book-reading", media: book, status: "reading", currentPage: 100, totalPages: 400, progressPercent: 25, updatedAt: "2026-01-02T12:00:00.000Z" }];

  const events = projectActivity(state);
  assert.deepEqual(events.map(({ eventType }) => eventType), ["episode_watch", "game_update", "book_update", "movie_watch"]);
  assert.equal(events[0].episode?.title, "Consequence");
  assert.equal(events[3].rating, 4.5);
  assert.equal(events.length, 4);
});

test("current state stays compact and separates card state from historical movie watches", () => {
  const state = emptyMosaicState();
  state.library = [{ media: movie, status: "watched", isFavorite: true, updatedAt: "2026-01-02T00:00:00.000Z" }];
  state.ratings = [{ mediaKey: "mock:movie:movie", value: 4.5, updatedAt: "2026-01-02T00:00:00.000Z" }];
  state.movieWatches = [
    { id: "one", media: movie, watchedAt: "2026-01-01", isRewatch: false },
    { id: "two", media: movie, watchedAt: "2026-01-02", isRewatch: true },
  ];

  const snapshot = deriveCurrentMediaState(state);
  assert.deepEqual(snapshot, [{ mediaKey: "mock:movie:movie", status: "watched", rating: 4.5, isFavorite: true, latestOccurredAt: "2026-01-02T00:00:00.000Z" }]);
  assert.equal(projectActivity(state).filter(({ eventType }) => eventType === "movie_watch").length, 2);
});

test("Continue only includes unfinished series, games, and books", () => {
  const state = emptyMosaicState();
  state.library = [{ media: series, status: "watching", isFavorite: false, updatedAt: "2026-01-03T00:00:00.000Z" }];
  state.movieWatches = [{ id: "movie", media: movie, watchedAt: "2026-01-05", isRewatch: false }];
  state.episodeWatches = [{ id: "episode", series, seasonNumber: 1, episodeNumber: 3, watchedAt: "2026-01-03T00:00:00.000Z" }];
  state.gamePlaythroughs = [{ id: "game", media: game, status: "playing", platform: "PC", playtimeMinutes: 90, progressPercent: 42, updatedAt: "2026-01-04T00:00:00.000Z" }];
  state.bookReadings = [{ id: "book", media: book, status: "reading", currentPage: 200, totalPages: 400, progressPercent: 50, updatedAt: "2026-01-02T00:00:00.000Z" }];

  const items = deriveContinue(state);
  assert.deepEqual(items.map(({ kind }) => kind), ["game", "series", "book"]);
  assert.equal(items.some(({ media }) => media.mediaType === "movie"), false);
  const continuedSeries = items.find(({ kind }) => kind === "series");
  assert.equal(continuedSeries?.label, "Next · S02E01");
  assert.equal(continuedSeries?.progress, 13);
  assert.equal(continuedSeries?.detail, "1 / 8 released episodes");
});

test("series continuation counts unique released episodes and imported completed seasons without inventing logs", () => {
  const state = emptyMosaicState();
  state.library = [{ media: series, status: "watching", isFavorite: false, updatedAt: "2026-01-04T00:00:00.000Z" }];
  state.episodeWatches = [
    { id: "first", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-01-04T00:00:00.000Z" },
    { id: "rewatch", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-01-05T00:00:00.000Z", isRewatch: true },
  ];
  state.seasonStates = [{ id: "import", series, seasonNumber: 2, state: "completed", provenance: "imported_state", updatedAt: "2026-01-03T00:00:00.000Z" }];
  const item = deriveContinue(state).find(({ kind }) => kind === "series");
  assert.equal(item?.progress, 75);
  assert.equal(item?.label, "Next · S01E02");
  assert.equal(item?.detail, "6 / 8 released episodes");
  assert.equal(projectActivity(state).filter(({ eventType }) => eventType === "episode_watch").length, 2);
});

test("future episode logs do not advance released-series progress", () => {
  const state = emptyMosaicState();
  const airingSeries: CatalogSeries = { ...series, eligibleEpisodeCount: 4, eligibleEpisodeCounts: { 1: 3, 2: 1 } };
  state.library = [{ media: airingSeries, status: "watching", isFavorite: false, updatedAt: "2026-01-04T00:00:00.000Z" }];
  state.episodeWatches = [{ id: "future", series: airingSeries, seasonNumber: 2, episodeNumber: 5, watchedAt: "2026-01-04T00:00:00.000Z" }];
  const item = deriveContinue(state).find(({ kind }) => kind === "series");
  assert.equal(item, undefined);
});

test("Home continuation can be capped while Library retains the complete active set", () => {
  const state = emptyMosaicState();
  state.gamePlaythroughs = Array.from({ length: 9 }, (_, index) => ({ id: String(index), media: { ...game, providerId: `game-${index}`, title: `Game ${index}` }, status: "playing" as const, playtimeMinutes: 0, progressPercent: 25, updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }));
  assert.equal(deriveContinue(state, { limit: 8 }).length, 8);
  assert.equal(deriveContinue(state).length, 9);
});

test("analytics remain rebuildable and never become a source of truth", () => {
  const state = emptyMosaicState();
  state.movieWatches = [{ id: "one", media: movie, watchedAt: "2026-02-01", isRewatch: false }, { id: "two", media: movie, watchedAt: "2026-02-03", isRewatch: true }];
  state.gamePlaythroughs = [{ id: "game", media: game, status: "completed", playtimeMinutes: 120, updatedAt: "2026-02-02T00:00:00.000Z" }];
  const analytics = deriveAnalytics(state, "2026-02-04T00:00:00.000Z");
  assert.deepEqual(analytics.movie, { watches: 2, rewatches: 1, uniqueMovies: 1 });
  assert.deepEqual(analytics.game, { completedPlaythroughs: 1, playtimeMinutes: 120 });
  assert.deepEqual(analytics.monthlyActivity, [{ month: "2026-02", count: 3 }]);
});

test("TV metrics keep unique episodes, explicit logs, rewatches, and bulk season state distinct", () => {
  const state = emptyMosaicState();
  state.episodeWatches = [
    { id: "first", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-02-01T00:00:00.000Z" },
    { id: "rewatch", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-02-02T00:00:00.000Z", isRewatch: true },
    { id: "second", series, seasonNumber: 1, episodeNumber: 2, watchedAt: "2026-02-03T00:00:00.000Z" },
  ];
  state.seasonStates = [{ id: "bulk", series, seasonNumber: 2, state: "completed", provenance: "imported_state", updatedAt: "2026-02-04T00:00:00.000Z" }];

  assert.deepEqual(deriveTvMetrics(state), {
    uniqueEpisodesWatched: 2,
    episodeWatchLogs: 3,
    episodeRewatches: 1,
    completedSeasons: 1,
    showsInProgress: 1,
    seriesStatuses: { watching: 0, paused: 0, completed: 0, dropped: 0, watchlist: 0 },
  });
});

test("canonical current media honors imported show state over watched history", () => {
  const state = emptyMosaicState();
  const watching: CatalogSeries = { ...series, providerId: "watching" };
  const paused: CatalogSeries = { ...series, providerId: "paused" };
  const historical: CatalogSeries = { ...series, providerId: "historical" };
  state.seriesStates = [
    { id: "watching", series: watching, facts: { watched_any: true, watchlisted: false, currently_watching: true, paused: false, dropped: false, finished: false }, updatedAt: "2026-02-03T00:00:00.000Z" },
    { id: "paused", series: paused, facts: { watched_any: true, watchlisted: false, currently_watching: false, paused: true, dropped: false, finished: false }, updatedAt: "2026-02-02T00:00:00.000Z" },
    { id: "historical", series: historical, facts: { watched_any: true, watchlisted: false, currently_watching: false, paused: false, dropped: false, finished: false }, updatedAt: "2026-02-01T00:00:00.000Z" },
  ];
  state.episodeWatches = [
    { id: "watch", series: watching, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-02-03T00:00:00.000Z" },
    { id: "paused-watch", series: paused, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-02-02T00:00:00.000Z" },
    { id: "historical-watch", series: historical, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-02-01T00:00:00.000Z" },
  ];
  assert.deepEqual(deriveContinue(state).map(({ media }) => media.providerId), ["watching"]);
});

test("mobile ContinueItem projection maps active domain state without fabricated progress", () => {
  const state = emptyMosaicState();
  const activeSeries: CatalogSeries = { ...series, providerId: "active-series", posterUrl: "https://art.test/series-poster.jpg", backdropUrl: "https://art.test/series-backdrop.jpg" };
  const unknownSeries: CatalogSeries = { ...series, providerId: "unknown-series", episodeCount: undefined, eligibleEpisodeCount: undefined, seasonEpisodeCounts: undefined, eligibleEpisodeCounts: undefined };
  const finishedSeries: CatalogSeries = { ...series, providerId: "finished-series" };
  const historicalSeries: CatalogSeries = { ...series, providerId: "history-only" };
  state.library = [
    { media: activeSeries, status: "watching", isFavorite: false, updatedAt: "2026-03-03T00:00:00.000Z" },
    { media: unknownSeries, status: "watching", isFavorite: false, updatedAt: "2026-03-02T00:00:00.000Z" },
    { media: finishedSeries, status: "completed", isFavorite: false, updatedAt: "2026-03-01T00:00:00.000Z" },
  ];
  state.seriesStates = [{ id: "history", series: historicalSeries, facts: { watched_any: true, currently_watching: false, paused: false, dropped: false, finished: false, watchlisted: false }, updatedAt: "2026-03-04T00:00:00.000Z" }];
  state.episodeWatches = [{ id: "episode", series: activeSeries, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-03-03T00:00:00.000Z" }];
  state.bookReadings = [
    { id: "reading", media: { ...book, posterUrl: "https://art.test/book.jpg" }, status: "reading", currentPage: 100, totalPages: 400, updatedAt: "2026-03-05T00:00:00.000Z" },
    { id: "finished", media: { ...book, providerId: "finished-book" }, status: "finished", currentPage: 400, totalPages: 400, updatedAt: "2026-03-06T00:00:00.000Z" },
    { id: "dnf", media: { ...book, providerId: "dnf-book" }, status: "dnf", updatedAt: "2026-03-06T00:00:00.000Z" },
  ];
  state.gamePlaythroughs = [
    { id: "playing", media: game, status: "playing", playtimeMinutes: 123, progressPercent: undefined, updatedAt: "2026-03-04T00:00:00.000Z" },
    { id: "completed", media: { ...game, providerId: "completed-game" }, status: "completed", playtimeMinutes: 300, progressPercent: 100, updatedAt: "2026-03-06T00:00:00.000Z" },
    { id: "dropped", media: { ...game, providerId: "dropped-game" }, status: "dropped", playtimeMinutes: 12, updatedAt: "2026-03-06T00:00:00.000Z" },
  ];

  const items = projectContinueItems(state);
  assert.deepEqual(items.map((item) => item.id), ["mock:book:book", "mock:game:game", "mock:tv:active-series"]);
  assert.equal(items.some((item) => item.id === "mock:tv:history-only"), false);
  assert.equal(items.some((item) => item.id.includes("finished") || item.id.includes("dnf") || item.id.includes("dropped")), false);

  const seriesItem = items.find((item) => item.id === "mock:tv:active-series");
  assert.deepEqual(seriesItem?.progress, { watchedEpisodes: 1, totalEpisodes: 8, percent: 13, nextSeasonNumber: 1, nextEpisodeNumber: 2 });
  assert.equal(seriesItem?.posterUrl, "https://art.test/series-poster.jpg");
  assert.equal(seriesItem?.backdropUrl, "https://art.test/series-backdrop.jpg");
  assert.deepEqual(seriesItem?.nextAction, { type: "log_episode", seasonNumber: 1, episodeNumber: 2 });

  assert.deepEqual(items.find((item) => item.id === "mock:book:book")?.progress, { currentPage: 100, totalPages: 400, percent: 25 });
  assert.deepEqual(items.find((item) => item.id === "mock:game:game")?.progress, { percent: null, playtimeMinutes: 123 });
});

test("Continue only includes partial, activity-backed progress across domains", () => {
  const state = emptyMosaicState();
  const longSeries: CatalogSeries = { ...series, providerId: "long-series", eligibleEpisodeCount: 39, seasonEpisodeCounts: { 1: 39 } };
  state.library = [{ media: longSeries, status: "watching", isFavorite: false, updatedAt: "2026-04-01T00:00:00.000Z" }];
  state.episodeWatches = Array.from({ length: 39 }, (_, index) => ({ id: `episode-${index + 1}`, series: longSeries, seasonNumber: 1, episodeNumber: index + 1, watchedAt: `2026-04-${String(Math.min(index + 1, 28)).padStart(2, "0")}T00:00:00.000Z` }));
  state.bookReadings = [
    { id: "book-zero", media: { ...book, providerId: "book-zero" }, status: "reading", currentPage: 0, totalPages: 400, updatedAt: "2026-04-01T00:00:00.000Z" },
    { id: "book-partial", media: { ...book, providerId: "book-partial" }, status: "reading", currentPage: 120, totalPages: 400, updatedAt: "2026-04-02T00:00:00.000Z" },
    { id: "book-finished", media: { ...book, providerId: "book-finished" }, status: "finished", currentPage: 400, totalPages: 400, updatedAt: "2026-04-03T00:00:00.000Z" },
  ];
  state.gamePlaythroughs = [
    { id: "game-zero", media: { ...game, providerId: "game-zero" }, status: "playing", playtimeMinutes: 0, progressPercent: 0, updatedAt: "2026-04-01T00:00:00.000Z" },
    { id: "game-partial", media: { ...game, providerId: "game-partial" }, status: "paused", playtimeMinutes: 40, progressPercent: 35, updatedAt: "2026-04-02T00:00:00.000Z" },
    { id: "game-finished", media: { ...game, providerId: "game-finished" }, status: "completed", playtimeMinutes: 400, progressPercent: 100, updatedAt: "2026-04-03T00:00:00.000Z" },
  ];

  const ids = deriveContinue(state).map((item) => item.media.providerId);
  assert.deepEqual(ids, ["book-partial", "game-partial"]);

  state.episodeWatches = state.episodeWatches.slice(0, 1);
  assert.equal(deriveContinue(state).some((item) => item.media.providerId === "long-series"), true);
});
