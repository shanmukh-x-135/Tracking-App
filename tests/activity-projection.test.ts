import assert from "node:assert/strict";
import test from "node:test";
import { projectActivity } from "../src/lib/activity/projection";
import { deriveContinue } from "../src/lib/home/continue";
import { deriveAnalytics, deriveTvMetrics } from "../src/lib/analytics/derive";
import { deriveCurrentMediaState } from "../src/lib/persistence/current-media-state";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { CatalogBook, CatalogGame, CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { provider: "mock", providerId: "movie", mediaType: "movie", title: "Movie", genres: [] };
const series: CatalogSeries = { provider: "mock", providerId: "series", mediaType: "tv", title: "Series", genres: [], episodeCount: 10, eligibleEpisodeCount: 8, seasonEpisodeCounts: { 1: 3, 2: 5, 3: 2 } };
const game: CatalogGame = { provider: "mock", providerId: "game", mediaType: "game", title: "Game", genres: [], platforms: ["PC"] };
const book: CatalogBook = { provider: "mock", providerId: "book", mediaType: "book", title: "Book", genres: [], authors: [], pageCount: 400 };

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
  assert.equal(item?.progress, 0);
  assert.equal(item?.label, "Next · S01E01");
});

test("Home continuation can be capped while Library retains the complete active set", () => {
  const state = emptyMosaicState();
  state.gamePlaythroughs = Array.from({ length: 9 }, (_, index) => ({ id: String(index), media: { ...game, providerId: `game-${index}`, title: `Game ${index}` }, status: "playing" as const, playtimeMinutes: 0, updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }));
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
    showsInProgress: 0,
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
