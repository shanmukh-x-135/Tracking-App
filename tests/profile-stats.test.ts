import assert from "node:assert/strict";
import test from "node:test";
import { deriveTvMetrics } from "../src/lib/analytics/derive";
import { deriveProfileStats, statsYears } from "../src/lib/analytics/stats";
import type { CatalogBook, CatalogGame, CatalogMovie, CatalogSeries } from "../src/lib/media/types";
import { deriveProfileMovieCount } from "../src/lib/mosaic/snapshot";
import { emptyMosaicState, type MosaicState } from "../src/lib/persistence/types";

const movie = (id: number, genres: string[] = ["Drama"]): CatalogMovie => ({ provider: "mock", providerId: `movie-${id}`, mediaType: "movie", title: `Film ${id}`, genres });
const series = (id: number): CatalogSeries => ({ provider: "mock", providerId: `series-${id}`, mediaType: "tv", title: `Show ${id}`, genres: ["Mystery"] });
const game = (id: number): CatalogGame => ({ provider: "mock", providerId: `game-${id}`, mediaType: "game", title: `Game ${id}`, genres: ["RPG"], platforms: [] });
const book = (id: number, authors: string[]): CatalogBook => ({ provider: "mock", providerId: `book-${id}`, mediaType: "book", title: `Book ${id}`, genres: [], authors });

function library(): MosaicState {
  const state = emptyMosaicState();
  // Five films across two years plus one rewatch in 2026.
  state.movieWatches = [
    { id: "m1", media: movie(1), watchedAt: "2025-03-02", isRewatch: false },
    { id: "m2", media: movie(2), watchedAt: "2025-11-20", isRewatch: false },
    { id: "m3", media: movie(3, []), watchedAt: "2026-01-05", isRewatch: false },
    { id: "m4", media: movie(4, ["Drama", "Thriller"]), watchedAt: "2026-02-14", isRewatch: false },
    { id: "m5", media: movie(5), watchedAt: "2026-02-15", isRewatch: false },
    { id: "m1b", media: movie(1), watchedAt: "2026-02-20", isRewatch: true },
  ];
  // Episode history including a rewatch of the same episode.
  state.episodeWatches = [
    { id: "e1", series: series(1), seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-02-01T21:00:00.000Z" },
    { id: "e2", series: series(1), seasonNumber: 1, episodeNumber: 2, watchedAt: "2026-02-02T21:00:00.000Z" },
    { id: "e1b", series: series(1), seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-03-01T21:00:00.000Z", isRewatch: true },
    { id: "e3", series: series(2), seasonNumber: 1, episodeNumber: 1, watchedAt: "2025-06-01T21:00:00.000Z" },
  ];
  state.gamePlaythroughs = [
    { id: "g1", media: game(1), status: "completed", playtimeMinutes: 600, updatedAt: "2024-05-01T00:00:00.000Z" },
    { id: "g2", media: game(2), status: "playing", playtimeMinutes: 90, progressPercent: 30, updatedAt: "2026-02-01T00:00:00.000Z" },
  ];
  state.bookReadings = [
    { id: "b1", media: book(1, ["Ursula K. Le Guin"]), status: "finished", currentPage: 300, totalPages: 300, updatedAt: "2023-01-01T00:00:00.000Z" },
    { id: "b2", media: book(2, ["Ursula K. Le Guin", "Co Author"]), status: "reading", currentPage: 40, totalPages: 200, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "b3", media: book(3, ["Unread Author"]), status: "want_to_read", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  state.ratings = [
    { mediaKey: "mock:movie:movie-1", value: 4.5, updatedAt: "2025-03-02T00:00:00.000Z" },
    { mediaKey: "mock:movie:movie-2", value: 3, updatedAt: "2025-11-20T00:00:00.000Z" },
    { mediaKey: "mock:tv:series-1", value: 5, updatedAt: "2026-03-01T00:00:00.000Z" },
    { mediaKey: "mock:game:game-1", value: .5, updatedAt: "2024-05-01T00:00:00.000Z" },
  ];
  return state;
}

test("all-time stats keep the established definitions and separate units", () => {
  const state = library();
  const stats = deriveProfileStats(state, { kind: "all" });
  // "Movies watched" stays a count of watch logs; distinct films are reported separately.
  assert.equal(stats.movie.watchLogs, deriveProfileMovieCount(state));
  assert.equal(stats.movie.watchLogs, 6);
  assert.equal(stats.movie.uniqueTitles, 5);
  assert.equal(stats.movie.rewatchLogs, 1);
  assert.equal(stats.movie.mostRewatched?.media.title, "Film 1");
  // Rewatches never inflate unique episodes, matching the existing TV metric.
  assert.equal(stats.series.uniqueEpisodes, deriveTvMetrics(state).uniqueEpisodesWatched);
  assert.equal(stats.series.uniqueEpisodes, 3);
  assert.equal(stats.series.episodeLogs, 4);
  assert.equal(stats.series.shows, 2);
  assert.deepEqual(stats.series.mostLogged.map(({ media, count }) => [media.title, count]), [["Show 1", 3], ["Show 2", 1]]);
  assert.equal(stats.game.completedPlaythroughs, 1);
  assert.equal(stats.game.recordedPlaytimeMinutes, 690);
  assert.equal(stats.book.finished, 1);
  assert.deepEqual(stats.book.authors, [{ name: "Ursula K. Le Guin", count: 2 }, { name: "Co Author", count: 1 }]);
});

test("a year filters dated history only and never re-dates games or books", () => {
  const state = library();
  const year = deriveProfileStats(state, { kind: "year", year: 2026 });
  assert.equal(year.movie.watchLogs, 4);
  assert.equal(year.movie.uniqueTitles, 4);
  assert.equal(year.series.episodeLogs, 3);
  assert.equal(year.series.uniqueEpisodes, 2);
  assert.equal(year.series.shows, 1);
  // Current-state media are identical whatever the period.
  const all = deriveProfileStats(state, { kind: "all" });
  assert.deepEqual(year.game, all.game);
  assert.deepEqual(year.book, all.book);
  assert.deepEqual(statsYears(state), [2026, 2025]);
});

test("ratings use half-star buckets and a stated population", () => {
  const state = library();
  const all = deriveProfileStats(state, { kind: "all" });
  assert.equal(all.ratings.population, "all");
  assert.equal(all.ratings.count, 4);
  const bucket = (value: number) => all.ratings.distribution.find((item) => item.value === value)!.count;
  assert.equal(bucket(4.5), 1);
  assert.equal(bucket(5), 1);
  assert.equal(bucket(.5), 1);
  assert.equal(all.ratings.distribution.length, 10);
  assert.equal(all.ratings.byMedium.movie.count, 2);
  assert.equal(all.ratings.byMedium.movie.average, 3.75);
  assert.deepEqual(all.ratings.top.map(({ media, value }) => [media.title, value]), [["Show 1", 5], ["Film 1", 4.5], ["Film 2", 3], ["Game 1", .5]]);
  // In a year, only titles with dated activity that year are counted.
  const year = deriveProfileStats(state, { kind: "year", year: 2026 });
  assert.equal(year.ratings.population, "logged-in-period");
  assert.deepEqual(year.ratings.top.map(({ media }) => media.title), ["Show 1", "Film 1"]);
  assert.equal(year.ratings.average, 4.75);
});

test("activity buckets use real dates and the correct period boundaries", () => {
  const state = library();
  const year = deriveProfileStats(state, { kind: "year", year: 2026 });
  assert.equal(year.activity.movie.buckets.length, 12);
  assert.equal(year.activity.movie.buckets.reduce((sum, bucket) => sum + bucket.count, 0), year.movie.watchLogs);
  assert.deepEqual(year.activity.movie.peak, { key: "2026-02", label: "Feb", count: 3 });
  assert.equal(year.activity.series.unit, "episodes logged");
  assert.equal(year.activity.series.weekdays.reduce((sum, count) => sum + count, 0), 3);
  // Short all-time spans stay monthly and include empty months honestly.
  const all = deriveProfileStats(state, { kind: "all" });
  assert.equal(all.activity.movie.granularity, "month");
  assert.equal(all.activity.movie.buckets[0].key, "2025-03");
  assert.equal(all.activity.movie.buckets.at(-1)!.key, "2026-02");
  assert.ok(all.activity.movie.buckets.some((bucket) => bucket.count === 0));
  // Long histories group by year.
  state.movieWatches.push({ id: "old", media: movie(9), watchedAt: "2019-07-01", isRewatch: false });
  const long = deriveProfileStats(state, { kind: "all" });
  assert.equal(long.activity.movie.granularity, "year");
  assert.deepEqual(long.activity.movie.buckets.map(({ key }) => key), ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
});

test("genres count each title once and report titles without metadata", () => {
  const stats = deriveProfileStats(library(), { kind: "all" });
  assert.equal(stats.genres.movie.titles, 5);
  assert.equal(stats.genres.movie.withGenres, 4);
  assert.deepEqual(stats.genres.movie.top[0], { name: "Drama", count: 4 });
  assert.equal(stats.genres.book.withGenres, 0);
});

test("an empty account produces honest zeros", () => {
  const stats = deriveProfileStats(emptyMosaicState(), { kind: "all" });
  assert.equal(stats.movie.watchLogs, 0);
  assert.equal(stats.ratings.average, undefined);
  assert.deepEqual(stats.activity.movie.buckets, []);
  assert.equal(stats.activity.movie.peak, undefined);
  assert.deepEqual(statsYears(emptyMosaicState()), []);
});
