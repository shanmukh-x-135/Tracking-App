import assert from "node:assert/strict";
import test from "node:test";
import { createProviderKey, isProviderKey, parseProviderKey } from "../src/lib/media/identity";
import { normalizeGoogleBook } from "../src/lib/media/providers/google-books";
import { normalizeIgdb } from "../src/lib/media/providers/igdb";
import { normalizeTmdb } from "../src/lib/media/providers/tmdb";
import { aggregateProviderSearch } from "../src/lib/media/search";
import type { CatalogProvider } from "../src/lib/media/types";

test("provider-qualified identities round trip and enforce domains", () => {
  const key = createProviderKey({ provider: "tmdb", mediaType: "movie", providerId: "157336" });
  assert.equal(key, "tmdb:movie:157336");
  assert.deepEqual(parseProviderKey(key), { provider: "tmdb", mediaType: "movie", providerId: "157336" });
  assert.equal(isProviderKey("igdb:game:1942"), true);
  assert.equal(isProviderKey("tmdb:book:157336"), false);
  assert.throws(() => createProviderKey({ provider: "googlebooks", mediaType: "movie", providerId: "book" }));
});

test("TMDB normalizes movies and series without inventing missing metadata", () => {
  const movie = normalizeTmdb({
    id: 157336, media_type: "movie", title: "Interstellar", release_date: "2014-11-05",
    poster_path: "/poster.jpg", backdrop_path: null, vote_average: 8.4, genre_ids: [18, 878],
  });
  assert.equal(movie?.mediaType, "movie");
  assert.equal(movie?.releaseYear, 2014);
  assert.equal(movie?.posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.deepEqual(movie?.genres, ["Drama", "Science Fiction"]);
  assert.equal(movie?.backdropUrl, undefined);

  const series = normalizeTmdb({ id: 1408, media_type: "tv", name: "House", first_air_date: "2004" });
  assert.equal(series?.mediaType, "tv");
  assert.equal(series?.title, "House");
  assert.equal(series?.description, undefined);
});

test("IGDB normalizes game-specific metadata and rating scale", () => {
  const game = normalizeIgdb({
    id: 1942, name: "The Witcher 3", first_release_date: 1431993600, rating: 92,
    cover: { image_id: "co1wyy" }, genres: [{ name: "Role-playing" }],
    platforms: [{ name: "PC" }], involved_companies: [
      { developer: true, company: { name: "CD Projekt RED" } },
      { publisher: true, company: { name: "CD Projekt" } },
    ],
  });
  assert.equal(game.mediaType, "game");
  assert.equal(game.communityRating, 4.6);
  assert.equal(game.developer, "CD Projekt RED");
  assert.deepEqual(game.platforms, ["PC"]);
});

test("Google Books treats incomplete metadata as optional", () => {
  const book = normalizeGoogleBook({ id: "volume-id", volumeInfo: { title: "A Book", publishedDate: "1999", imageLinks: { thumbnail: "http://books.google.com/cover.jpg" } } });
  assert.equal(book.mediaType, "book");
  assert.equal(book.releaseYear, 1999);
  assert.equal(book.posterUrl, "https://books.google.com/cover.jpg");
  assert.equal(book.pageCount, undefined);
  assert.deepEqual(book.authors, []);
});

test("catalog search returns partial success when one provider fails", async () => {
  const successful: CatalogProvider = {
    name: "mock",
    async search() { return [{ providerId: "dune", provider: "mock", mediaType: "book", title: "Dune", genres: [], authors: [] }]; },
    async getById() { return null; },
  };
  const failing: CatalogProvider = {
    name: "igdb",
    async search() { throw new Error("Games are temporarily unavailable."); },
    async getById() { return null; },
  };
  const result = await aggregateProviderSearch("dune", [successful, failing]);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.failures, [{ provider: "igdb", message: "Games are temporarily unavailable." }]);
});
