import assert from "node:assert/strict";
import test from "node:test";
import { discoveryRails, spotlightPosition } from "../src/lib/media/discovery";
import { mockCatalogProvider } from "../src/lib/media/providers/mock";
import { TmdbProvider } from "../src/lib/media/providers/tmdb";
import { addIfUntracked, applyMutation, saveForLaterStatus } from "../src/lib/persistence/domain";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { PersistenceMutation } from "../src/lib/persistence/types";
import { persistenceMutationSchema } from "../src/lib/persistence/validation";
import type { CatalogDiscoverySection, CatalogMedia } from "../src/lib/media/types";
import type { MediaType } from "../src/types/media";

const item = (mediaType: MediaType, providerId: string): CatalogMedia => ({ provider: "mock", providerId, mediaType, title: providerId, genres: [], platforms: [], authors: [] }) as CatalogMedia;
const section = (id: string, label: string, mediaType: MediaType, items: CatalogMedia[], error?: string): CatalogDiscoverySection => ({ id, label, mediaType, items, error });

// Shaped like live TMDB output: five movie sections come before any other medium.
const liveShaped = [
  section("tmdb-movie-trending", "Trending movies", "movie", [item("movie", "m1")]),
  section("tmdb-movie-popular", "Popular movies", "movie", [item("movie", "m2")]),
  section("tmdb-movie-now-playing", "Now playing", "movie", [item("movie", "m3")]),
  section("tmdb-movie-upcoming", "Upcoming movies", "movie", [item("movie", "m4")]),
  section("tmdb-movie-top-rated", "Top rated movies", "movie", [item("movie", "m5")]),
  section("tmdb-tv-trending", "Trending series", "tv", [item("tv", "t1")]),
  section("tmdb-tv-popular", "Popular series", "tv", [item("tv", "t2")]),
  section("igdb-popular", "Popular on IGDB", "game", [item("game", "g1")]),
  section("googlebooks-fiction", "Fiction books", "book", [item("book", "b1")]),
];

test("All exposes one rail per medium, each with only that medium and its provider label", () => {
  const rails = discoveryRails(liveShaped, null);
  assert.deepEqual(rails.map(({ mediaType, label }) => [mediaType, label]), [["movie", "Trending movies"], ["tv", "Trending series"], ["game", "Popular on IGDB"], ["book", "Fiction books"]]);
  for (const rail of rails) assert.ok(rail.items.every((media) => media.mediaType === rail.mediaType));
});

test("section assignment survives a reordered response", () => {
  const rails = discoveryRails([...liveShaped].reverse(), null);
  assert.deepEqual(rails.map(({ mediaType }) => mediaType), ["movie", "tv", "game", "book"]);
  for (const rail of rails) {
    assert.equal(rail.items.length, 1);
    assert.ok(rail.items.every((media) => media.mediaType === rail.mediaType));
  }
});

test("a missing or failed medium is shown as empty, never filled with another medium", () => {
  const withoutBooks = liveShaped.filter((entry) => entry.mediaType !== "book");
  const failedGames = withoutBooks.map((entry) => entry.mediaType === "game" ? { ...entry, items: [], error: "This provider section is temporarily unavailable." } : entry);
  const [, , games, books] = discoveryRails(failedGames, null);
  assert.deepEqual([games.mediaType, games.items, games.error], ["game", [], "This provider section is temporarily unavailable."]);
  assert.deepEqual([books.mediaType, books.items], ["book", []]);
  assert.match(books.error ?? "", /No books/);
  // A mislabelled item inside a section is dropped rather than shown under the wrong medium.
  const [movies] = discoveryRails([section("x", "Trending movies", "movie", [item("movie", "m1"), item("tv", "t1")])], null);
  assert.deepEqual(movies.items.map(({ providerId }) => providerId), ["m1"]);
});

test("All prefers a medium's first section that has items", () => {
  const [movies] = discoveryRails([section("a", "Trending movies", "movie", [], "down"), section("b", "Popular movies", "movie", [item("movie", "m2")])], null);
  assert.equal(movies.label, "Popular movies");
});

test("each media tab shows every section of only that medium", () => {
  assert.deepEqual(discoveryRails(liveShaped, "movie").map(({ label }) => label), ["Trending movies", "Popular movies", "Now playing", "Upcoming movies", "Top rated movies"]);
  for (const type of ["movie", "tv", "game", "book"] as const) assert.ok(discoveryRails(liveShaped, type).every((rail) => rail.mediaType === type));
  assert.deepEqual(discoveryRails([], "book").map(({ mediaType, items }) => [mediaType, items.length]), [["book", 0]]);
});

test("section labels come from the provider definitions, in mock and live", async () => {
  const mock = await mockCatalogProvider.discoverSections?.() ?? [];
  assert.deepEqual(discoveryRails(mock, null).map(({ label }) => label), ["Movie catalog", "Series catalog", "Game catalog", "Book catalog"]);
  const tmdb = new TmdbProvider("token", async () => new Response(JSON.stringify({ results: [] })));
  const labels = Object.fromEntries((await tmdb.discoverSections()).map(({ id, label }) => [id, label]));
  assert.equal(labels["tmdb-movie-trending"], "Trending movies");
  assert.equal(labels["tmdb-movie-popular"], "Popular movies");
  assert.equal(labels["tmdb-movie-upcoming"], "Upcoming movies");
  assert.equal(labels["tmdb-tv-trending"], "Trending series");
});

test("spotlight position stays in range for shrinking, empty, and single collections", () => {
  assert.equal(spotlightPosition(3, 2), 1); // 4 slides at the last one, then 2 slides
  assert.equal(spotlightPosition(3, 0), 0);
  assert.equal(spotlightPosition(5, 1), 0);
  assert.equal(spotlightPosition(-1, 1), 0);
  assert.equal(spotlightPosition(-1, 4), 3); // previous from the first wraps to the last
  assert.equal(spotlightPosition(4, 4), 0); // next from the last wraps to the first
  for (let index = -8; index < 8; index += 1) for (let length = 0; length < 5; length += 1) {
    const position = spotlightPosition(index, length);
    assert.ok(position >= 0 && position < Math.max(length, 1));
  }
});

test("save for later uses each medium's planned status, which the server schema accepts", () => {
  const expected = { movie: "watchlist", tv: "watchlist", game: "backlog", book: "want_to_read" } as const;
  for (const mediaType of ["movie", "tv", "game", "book"] as const) {
    const media = item(mediaType, `${mediaType}-1`);
    assert.equal(saveForLaterStatus(media), expected[mediaType]);
    assert.ok(persistenceMutationSchema.safeParse({ type: "library.upsert", media, status: saveForLaterStatus(media) }).success);
  }
});

test("save for later adds untracked media through library.upsert", async () => {
  const media = item("tv", "show");
  const sent: PersistenceMutation[] = [];
  let state = emptyMosaicState();
  const result = await addIfUntracked(state, media, saveForLaterStatus(media), async (mutation) => { sent.push(mutation); state = applyMutation(state, mutation); });
  assert.equal(result, "added");
  assert.deepEqual(sent, [{ type: "library.upsert", media, status: "watchlist" }]);
  assert.deepEqual(state.library.map(({ status, isFavorite }) => [status, isFavorite]), [["watchlist", false]]);
});

test("save for later never resets an already-tracked item", async () => {
  const media = item("movie", "seen");
  const state = applyMutation(emptyMosaicState(), { type: "library.upsert", media, status: "watched", isFavorite: true });
  let calls = 0;
  assert.equal(await addIfUntracked(state, media, saveForLaterStatus(media), async () => { calls += 1; }), "already-tracked");
  assert.equal(calls, 0);
  assert.deepEqual(state.library.map(({ status, isFavorite }) => [status, isFavorite]), [["watched", true]]);
});

test("a failed save rejects so the caller can show an error and retry", async () => {
  const media = item("game", "g");
  await assert.rejects(addIfUntracked(emptyMosaicState(), media, saveForLaterStatus(media), async () => { throw new Error("offline"); }), /offline/);
});
