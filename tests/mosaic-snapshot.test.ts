import assert from "node:assert/strict";
import test from "node:test";
import { deriveMosaicSnapshot, deriveProfileMovieCount, periodFor } from "../src/lib/mosaic/snapshot";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { CatalogBook, CatalogGame, CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { provider: "mock", providerId: "movie", mediaType: "movie", title: "Movie", genres: [] };
const series: CatalogSeries = { provider: "mock", providerId: "series", mediaType: "tv", title: "Series", genres: [] };
const game: CatalogGame = { provider: "mock", providerId: "game", mediaType: "game", title: "Game", genres: [], platforms: [] };
const book: CatalogBook = { provider: "mock", providerId: "book", mediaType: "book", title: "Book", genres: [], authors: [], pageCount: 100 };

test("Mosaic keeps unrated, non-rewatch activity as a first-class tile", () => {
  const state = emptyMosaicState();
  state.movieWatches = [{ id: "first", media: movie, watchedAt: "2026-02-01", isRewatch: false }];
  const tile = deriveMosaicSnapshot(state).tiles[0];
  assert.equal(tile.title, "Movie");
  assert.deepEqual(tile.userSignals, {});
  assert.equal(tile.activity.eventCount, 1);
});

test("Mosaic counts one series tile only from explicit episode activity", () => {
  const state = emptyMosaicState();
  state.library = [{ media: series, status: "watching", isFavorite: false, updatedAt: "2026-01-01T00:00:00.000Z" }];
  assert.equal(deriveMosaicSnapshot(state).tiles.length, 0);
  state.episodeWatches = [{ id: "episode", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-01-02T00:00:00.000Z" }];
  const snapshot = deriveMosaicSnapshot(state);
  assert.deepEqual(snapshot.tiles.map((tile) => tile.mediaType), ["series"]);
  assert.equal(snapshot.tiles[0].activity.eventCount, 1);
});

test("Mosaic has an honest empty state and filters one title per selected year", () => {
  const state = emptyMosaicState();
  assert.equal(deriveMosaicSnapshot(state).totals.storiesRepresented, 0);
  state.movieWatches = [{ id: "old", media: movie, watchedAt: "2025-12-30", isRewatch: false }, { id: "new", media: movie, watchedAt: "2026-01-02", isRewatch: true }];
  const snapshot = deriveMosaicSnapshot(state, periodFor("2026"));
  assert.equal(snapshot.tiles.length, 1);
  assert.equal(snapshot.tiles[0].activity.eventCount, 1);
  assert.equal(snapshot.tiles[0].userSignals.rewatchCount, 1);
});

test("Mosaic only admits real game and book progress, and shares Profile's movie log count", () => {
  const state = emptyMosaicState();
  state.library = [{ media: game, status: "playing", isFavorite: false, updatedAt: "2026-01-01T00:00:00.000Z" }, { media: book, status: "reading", isFavorite: false, updatedAt: "2026-01-01T00:00:00.000Z" }];
  state.gamePlaythroughs = [{ id: "game", media: game, status: "playing", playtimeMinutes: 0, progressPercent: 0, updatedAt: "2026-01-02T00:00:00.000Z" }];
  state.bookReadings = [{ id: "book", media: book, status: "reading", currentPage: 10, totalPages: 100, updatedAt: "2026-01-02T00:00:00.000Z" }];
  state.movieWatches = [{ id: "one", media: movie, watchedAt: "2026-01-02", isRewatch: false }, { id: "two", media: movie, watchedAt: "2026-01-03", isRewatch: true }];
  const snapshot = deriveMosaicSnapshot(state);
  assert.deepEqual(snapshot.tiles.map((tile) => tile.mediaType).sort(), ["book", "movie"]);
  assert.equal(deriveProfileMovieCount(state), 2);
  assert.equal(snapshot.totals.movieWatchLogs, 2);
});
