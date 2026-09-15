import assert from "node:assert/strict";
import test from "node:test";
import { createProviderKey, isProviderKey, parseProviderKey } from "../src/lib/media/identity";
import { normalizeGoogleBook } from "../src/lib/media/providers/google-books";
import { normalizeIgdb } from "../src/lib/media/providers/igdb";
import { normalizeTmdb, TmdbProvider } from "../src/lib/media/providers/tmdb";
import { mockCatalogProvider } from "../src/lib/media/providers/mock";
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

test("TMDB season adapter returns every supplied episode in episode order", async () => {
  const provider = new TmdbProvider("token", async () => new Response(JSON.stringify({ episodes: [
    { id: 30, episode_number: 3, name: "Third" }, { id: 10, episode_number: 1, name: "First" }, { id: 20, episode_number: 2, name: "Second" },
  ] }), { status: 200 }));
  const episodes = await provider.getSeasonEpisodes("123", 2);
  assert.deepEqual(episodes.map(({ episodeNumber, title }) => [episodeNumber, title]), [[1, "First"], [2, "Second"], [3, "Third"]]);
});

test("TMDB search considers a second page and ranks punctuation variants first", async () => {
  const provider = new TmdbProvider("token", async (input) => {
    const page = new URL(String(input)).searchParams.get("page");
    return new Response(JSON.stringify({ results: page === "1"
      ? [{ id: 1, media_type: "movie", title: "Dune Messiah" }]
      : [{ id: 2, media_type: "movie", title: "Dune: Part Two" }, { id: 1, media_type: "movie", title: "Dune Messiah" }] }), { status: 200 });
  });
  const results = await provider.search("Dune Part Two");
  assert.deepEqual(results.map(({ title }) => title), ["Dune: Part Two", "Dune Messiah"]);
});

test("mock discovery and seasons remain deterministic for local UX checks", async () => {
  const movies = await mockCatalogProvider.discover?.("movie");
  const episodes = await mockCatalogProvider.getSeasonEpisodes?.("house", 1);
  assert.ok((movies?.length ?? 0) > 0);
  assert.equal(episodes?.length, 23);
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

test("Google Books descriptions are normalized to readable plain text", () => {
  const book = normalizeGoogleBook({
    id: "formatted-volume",
    volumeInfo: {
      title: "Formatted Book",
      description: "<b>A &amp; B</b><br><i>Dune</i>&nbsp;&#8212; readable<script>ignored()</script>",
    },
  });

  assert.equal(book.description, "A & B Dune — readable");
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
