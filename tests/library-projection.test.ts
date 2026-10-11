import assert from "node:assert/strict";
import test from "node:test";
import { projectLibraryEntries } from "../src/lib/library/projection";
import type { CatalogBook, CatalogGame, CatalogMedia, CatalogMovie, CatalogSeries } from "../src/lib/media/types";
import { mediaStatuses } from "../src/lib/persistence/validation";
import { emptyMosaicState, type LibraryStatus } from "../src/lib/persistence/types";

const make: Record<keyof typeof mediaStatuses, (id: string) => CatalogMedia> = {
  movie: (id) => ({ provider: "mock", providerId: id, mediaType: "movie", title: id, genres: [] }) satisfies CatalogMovie,
  tv: (id) => ({ provider: "mock", providerId: id, mediaType: "tv", title: id, genres: [] }) satisfies CatalogSeries,
  game: (id) => ({ provider: "mock", providerId: id, mediaType: "game", title: id, genres: [], platforms: [] }) satisfies CatalogGame,
  book: (id) => ({ provider: "mock", providerId: id, mediaType: "book", title: id, genres: [], authors: ["Ursula K. Le Guin"] }) satisfies CatalogBook,
};

test("every valid status of every medium can be filtered to exactly its items", () => {
  const state = emptyMosaicState();
  for (const [type, statuses] of Object.entries(mediaStatuses) as [keyof typeof mediaStatuses, readonly LibraryStatus[]][]) {
    for (const status of statuses) state.library.push({ media: make[type](`${type}-${status}`), status, isFavorite: false, updatedAt: "2026-09-01T00:00:00.000Z" });
  }
  for (const [type, statuses] of Object.entries(mediaStatuses) as [keyof typeof mediaStatuses, readonly LibraryStatus[]][]) {
    for (const status of statuses) {
      const result = projectLibraryEntries(state, { mediaType: type, status });
      assert.deepEqual(result.map(({ title }) => title), [`${type}-${status}`], `${type}/${status}`);
    }
  }
});

test("series status follows imported series state, but never a history-only fact", () => {
  const state = emptyMosaicState();
  const imported = make.tv("imported");
  const historyOnly = make.tv("history-only");
  state.library.push({ media: imported, status: "watching", isFavorite: false, updatedAt: "2026-09-01T00:00:00.000Z" });
  state.library.push({ media: historyOnly, status: "paused", isFavorite: false, updatedAt: "2026-09-01T00:00:00.000Z" });
  state.seriesStates.push({ id: "s1", series: imported, facts: { finished: true }, updatedAt: "2026-09-01T00:00:00.000Z" });
  state.seriesStates.push({ id: "s2", series: historyOnly, facts: { watched_any: true }, updatedAt: "2026-09-01T00:00:00.000Z" });
  assert.deepEqual(projectLibraryEntries(state, { mediaType: "tv", status: "completed" }).map(({ title }) => title), ["imported"]);
  assert.deepEqual(projectLibraryEntries(state, { mediaType: "tv", status: "paused" }).map(({ title }) => title), ["history-only"]);
});

test("search composes with filters and sorts; ratings are the user's own", () => {
  const state = emptyMosaicState();
  const add = (media: CatalogMedia, status: LibraryStatus, updatedAt: string) => state.library.push({ media, status, isFavorite: false, updatedAt });
  add({ ...make.movie("Dune"), communityRating: 2.1 }, "watched", "2026-09-01T00:00:00.000Z");
  add({ ...make.movie("dune-2"), title: "Dune: Part Two", communityRating: 4.8 }, "watchlist", "2026-09-03T00:00:00.000Z");
  add({ ...make.book("dispossessed"), title: "The Dispossessed" }, "reading", "2026-09-02T00:00:00.000Z");
  state.ratings.push({ mediaKey: "mock:movie:Dune", value: 5, updatedAt: "2026-09-01T00:00:00.000Z" });
  assert.deepEqual(projectLibraryEntries(state, { query: "dune" }).map(({ title }) => title), ["Dune: Part Two", "Dune"]);
  assert.deepEqual(projectLibraryEntries(state, { query: "dune", status: "watched" }).map(({ title }) => title), ["Dune"]);
  assert.deepEqual(projectLibraryEntries(state, { query: "le guin" }).map(({ title }) => title), ["The Dispossessed"]);
  assert.deepEqual(projectLibraryEntries(state, { query: "  zzz  " }), []);
  const byRating = projectLibraryEntries(state, { mediaType: "movie", sort: "rating" });
  assert.deepEqual(byRating.map(({ title, userRating }) => [title, userRating]), [["Dune", 5], ["Dune: Part Two", null]]);
  assert.deepEqual(projectLibraryEntries(state, { sort: "title" }).map(({ title }) => title), ["Dune", "Dune: Part Two", "The Dispossessed"]);
});
