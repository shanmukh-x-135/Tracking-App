import assert from "node:assert/strict";
import test from "node:test";
import { projectActivity } from "../src/lib/activity/projection";
import { deriveContinue } from "../src/lib/home/continue";
import { deriveCurrentMediaState } from "../src/lib/persistence/current-media-state";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { CatalogBook, CatalogGame, CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { provider: "mock", providerId: "movie", mediaType: "movie", title: "Movie", genres: [] };
const series: CatalogSeries = { provider: "mock", providerId: "series", mediaType: "tv", title: "Series", genres: [] };
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
  state.movieWatches = [{ id: "movie", media: movie, watchedAt: "2026-01-05", isRewatch: false }];
  state.episodeWatches = [{ id: "episode", series, seasonNumber: 1, episodeNumber: 3, watchedAt: "2026-01-03T00:00:00.000Z" }];
  state.gamePlaythroughs = [{ id: "game", media: game, status: "playing", platform: "PC", playtimeMinutes: 90, progressPercent: 42, updatedAt: "2026-01-04T00:00:00.000Z" }];
  state.bookReadings = [{ id: "book", media: book, status: "reading", currentPage: 200, totalPages: 400, progressPercent: 50, updatedAt: "2026-01-02T00:00:00.000Z" }];

  const items = deriveContinue(state);
  assert.deepEqual(items.map(({ kind }) => kind), ["game", "series", "book"]);
  assert.equal(items.some(({ media }) => media.mediaType === "movie"), false);
  assert.equal(items.find(({ kind }) => kind === "series")?.label, "Next: S01E04");
});
