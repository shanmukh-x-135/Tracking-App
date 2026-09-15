import assert from "node:assert/strict";
import test from "node:test";
import { applyMutation, calculateBookProgress } from "../src/lib/persistence/domain";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { CatalogBook, CatalogGame, CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { providerId: "movie", provider: "mock", mediaType: "movie", title: "Movie", genres: [] };
const series: CatalogSeries = { providerId: "series", provider: "mock", mediaType: "tv", title: "Series", genres: [] };
const game: CatalogGame = { providerId: "game", provider: "mock", mediaType: "game", title: "Game", genres: [], platforms: ["PC"] };
const book: CatalogBook = { providerId: "book", provider: "mock", mediaType: "book", title: "Book", genres: [], authors: [], pageCount: 400 };
const now = "2026-09-12T10:00:00.000Z";

test("movie watches retain repeatable rewatch history", () => {
  let state = applyMutation(emptyMosaicState(), { type: "movie.log", media: movie, watchedAt: now, isRewatch: false, viewingContext: "streaming", streamingService: "Mosaic+" }, now);
  state = applyMutation(state, { type: "movie.log", media: movie, watchedAt: now, isRewatch: true }, now);
  assert.equal(state.movieWatches.length, 2);
  assert.equal(state.movieWatches[0].isRewatch, true);
  assert.equal(state.movieWatches[1].viewingContext, "streaming");
  assert.equal(state.movieWatches[1].streamingService, "Mosaic+");
  assert.equal(state.library[0].status, "watched");
});

test("a single movie diary entry can be removed without collapsing other rewatches", () => {
  let state = applyMutation(emptyMosaicState(), { type: "movie.log", media: movie, watchedAt: now, isRewatch: false }, now);
  state = applyMutation(state, { type: "movie.log", media: movie, watchedAt: "2026-09-13", isRewatch: true }, now);
  const rewatch = state.movieWatches[0];
  state = applyMutation(state, { type: "movie.delete", watchId: rewatch.id }, now);
  assert.equal(state.movieWatches.length, 1);
  assert.equal(state.movieWatches[0].isRewatch, false);
});

test("ratings update in place and can be cleared", () => {
  let state = applyMutation(emptyMosaicState(), { type: "rating.set", media: movie, value: 3.5 }, now);
  state = applyMutation(state, { type: "rating.set", media: movie, value: 4.5 }, now);
  assert.deepEqual(state.ratings.map(({ value }) => value), [4.5]);
  state = applyMutation(state, { type: "rating.set", media: movie, value: null }, now);
  assert.equal(state.ratings.length, 0);
});

test("episode watches update a unique episode and preserve series progress inputs", () => {
  let state = applyMutation(emptyMosaicState(), { type: "episode.log", series, seasonNumber: 1, episodeNumber: 2, watchedAt: now }, now);
  state = applyMutation(state, { type: "episode.log", series, seasonNumber: 1, episodeNumber: 2, watchedAt: now, rating: 4 }, now);
  assert.equal(state.episodeWatches.length, 1);
  assert.equal(state.episodeWatches[0].rating, 4);
  state = applyMutation(state, { type: "episode.unwatch", series, seasonNumber: 1, episodeNumber: 2 }, now);
  assert.equal(state.episodeWatches.length, 0);
});

test("game playthrough updates preserve status, platform, playtime, and progress", () => {
  const state = applyMutation(emptyMosaicState(), { type: "game.upsert", media: game, status: "playing", platform: "PC", playtimeMinutes: 150, progressPercent: 25 }, now);
  assert.deepEqual(state.gamePlaythroughs[0], { id: state.gamePlaythroughs[0].id, media: game, status: "playing", platform: "PC", playtimeMinutes: 150, progressPercent: 25, rating: undefined, updatedAt: now });
  assert.equal(state.library[0].status, "playing");
});

test("book progress derives safely from pages", () => {
  assert.equal(calculateBookProgress(100, 400), 25);
  assert.equal(calculateBookProgress(100, 0), undefined);
  const state = applyMutation(emptyMosaicState(), { type: "book.upsert", media: book, status: "reading", currentPage: 120, totalPages: 400 }, now);
  assert.equal(state.bookReadings[0].progressPercent, 30);
});

test("cross-media lists retain deterministic insertion order", () => {
  let state = applyMutation(emptyMosaicState(), { type: "list.create", title: "Everything", description: "Mixed media", visibility: "private" }, now);
  const listId = state.lists[0].id;
  for (const media of [movie, series, game, book]) state = applyMutation(state, { type: "list.add", listId, media }, now);
  assert.deepEqual(state.lists[0].items.map(({ position }) => position), [0, 1, 2, 3]);
  assert.deepEqual(state.lists[0].items.map(({ media }) => media.mediaType), ["movie", "tv", "game", "book"]);
});

test("list edits preserve item identity and reject incomplete reorder requests", () => {
  let state = applyMutation(emptyMosaicState(), { type: "list.create", title: "Everything", description: "Mixed media", visibility: "private" }, now);
  const listId = state.lists[0].id;
  for (const media of [movie, series, game]) state = applyMutation(state, { type: "list.add", listId, media }, now);
  const [movieItem, seriesItem, gameItem] = state.lists[0].items;

  state = applyMutation(state, { type: "list.update", listId, title: "Story worlds", description: "Across formats", visibility: "public" }, now);
  state = applyMutation(state, { type: "list.item.update", listId, itemId: gameItem.id, note: "The game anchor" }, now);
  state = applyMutation(state, { type: "list.reorder", listId, itemIds: [gameItem.id, movieItem.id, seriesItem.id] }, now);
  assert.deepEqual(state.lists[0].items.map(({ id, position }) => [id, position]), [[gameItem.id, 0], [movieItem.id, 1], [seriesItem.id, 2]]);
  assert.equal(state.lists[0].items[0].note, "The game anchor");
  assert.equal(state.lists[0].visibility, "public");

  state = applyMutation(state, { type: "list.item.remove", listId, itemId: movieItem.id }, now);
  assert.deepEqual(state.lists[0].items.map(({ id, position }) => [id, position]), [[gameItem.id, 0], [seriesItem.id, 1]]);
  assert.throws(() => applyMutation(state, { type: "list.reorder", listId, itemIds: [gameItem.id] }, now), /invalid/);
});
