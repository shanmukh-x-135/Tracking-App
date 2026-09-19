import assert from "node:assert/strict";
import test from "node:test";
import { createProviderKey, isProviderKey, parseProviderKey } from "../src/lib/media/identity";
import { GoogleBooksProvider, normalizeGoogleBook } from "../src/lib/media/providers/google-books";
import { IgdbProvider, normalizeIgdb } from "../src/lib/media/providers/igdb";
import { normalizeTmdb, tmdbGenres, TmdbProvider } from "../src/lib/media/providers/tmdb";
import { mockCatalogProvider } from "../src/lib/media/providers/mock";
import { aggregateProviderSearch } from "../src/lib/media/search";
import { franchises } from "../src/lib/media/franchises";
import type { CatalogProvider } from "../src/lib/media/types";

test("provider-qualified identities round trip and enforce domains", () => {
  const key = createProviderKey({ provider: "tmdb", mediaType: "movie", providerId: "157336" });
  assert.equal(key, "tmdb:movie:157336");
  assert.deepEqual(parseProviderKey(key), { provider: "tmdb", mediaType: "movie", providerId: "157336" });
  assert.equal(isProviderKey("igdb:game:1942"), true);
  assert.equal(isProviderKey("tmdb:book:157336"), false);
  assert.throws(() => createProviderKey({ provider: "googlebooks", mediaType: "movie", providerId: "book" }));
});

test("franchise curation covers several cross-media universes with provider identities", () => {
  assert.ok(franchises.length >= 5);
  for (const franchise of franchises) {
    assert.ok(new Set(franchise.items.map((item) => item.mediaType)).size >= 2, `${franchise.title} needs multiple media types`);
    assert.ok(franchise.items.every((item) => item.providerId.trim()), `${franchise.title} has an incomplete identity`);
  }
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

test("TMDB watch providers normalize groups and preserve only the returned watch-options URL", async () => {
  const provider = new TmdbProvider("token", async () => new Response(JSON.stringify({ results: { IN: {
    link: "https://www.themoviedb.org/movie/1/watch?locale=IN",
    flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" }],
    rent: [{ provider_id: 2, provider_name: "Apple TV", logo_path: "/apple.png" }],
  } } }), { status: 200 }));
  const availability = await provider.getWatchAvailability("1", "movie", "IN");
  assert.equal(availability?.link, "https://www.themoviedb.org/movie/1/watch?locale=IN");
  assert.deepEqual(availability?.providers.map(({ name, kind, logoUrl }) => [name, kind, logoUrl]), [["Netflix", "flatrate", "https://image.tmdb.org/t/p/w500/netflix.png"], ["Apple TV", "rent", "https://image.tmdb.org/t/p/w500/apple.png"]]);
  assert.equal(await provider.getWatchAvailability("1", "movie", "india"), null);
});

test("TMDB watch availability keeps an empty regional response distinct from a missing region", async () => {
  const provider = new TmdbProvider("token", async () => new Response(JSON.stringify({ results: { GB: { link: "https://www.themoviedb.org/tv/2/watch?locale=GB" } } }), { status: 200 }));
  assert.deepEqual(await provider.getWatchAvailability("2", "tv", "GB"), { country: "GB", link: "https://www.themoviedb.org/tv/2/watch?locale=GB", providers: [] });
  assert.equal(await provider.getWatchAvailability("2", "tv", "US"), null);
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

test("TMDB provider genre discovery uses a stable numeric with_genres filter", async () => {
  let endpoint = "";
  const provider = new TmdbProvider("token", async (input) => {
    endpoint = String(input);
    return new Response(JSON.stringify({ results: [{ id: 1, title: "Genre result", genre_ids: [28] }] }), { status: 200 });
  });
  const items = await provider.discoverByGenre("movie", 28);
  assert.match(endpoint, /\/discover\/movie\?with_genres=28/);
  assert.deepEqual(items.map(({ title }) => title), ["Genre result"]);
  assert.ok(tmdbGenres.some((genre) => genre.id === 28 && genre.name === "Action"));
  assert.deepEqual(await provider.discoverByGenre("movie", 123_456), []);
});

test("mock discovery and seasons remain deterministic for local UX checks", async () => {
  const movies = await mockCatalogProvider.discover?.("movie");
  const sections = await mockCatalogProvider.discoverSections?.();
  const episodes = await mockCatalogProvider.getSeasonEpisodes?.("house", 1);
  assert.ok((movies?.length ?? 0) > 0);
  assert.deepEqual(sections?.map(({ mediaType }) => mediaType), ["movie", "tv", "game", "book"]);
  assert.ok(sections?.every(({ items }) => items.length > 0));
  assert.equal(episodes?.length, 23);
  const related = await mockCatalogProvider.related?.({ provider: "mock", providerId: "dune", mediaType: "book", title: "Dune", genres: [], authors: [] });
  assert.ok((related?.length ?? 0) > 0);
  assert.ok(!(related ?? []).some((item) => item.providerId === "dune"));
});

test("IGDB normalizes game-specific metadata and rating scale", () => {
  const game = normalizeIgdb({
    id: 1942, name: "The Witcher 3", first_release_date: 1431993600, rating: 92,
    cover: { image_id: "co1wyy" }, genres: [{ name: "Role-playing" }],
    platforms: [{ name: "PC" }], involved_companies: [
      { developer: true, company: { name: "CD Projekt RED", logo: { image_id: "logo" } } },
      { publisher: true, company: { name: "CD Projekt" } },
    ],
  });
  assert.equal(game.mediaType, "game");
  assert.equal(game.communityRating, 4.6);
  assert.equal(game.developer, "CD Projekt RED");
  assert.match(game.developerLogoUrl ?? "", /t_logo_med\/logo\.jpg$/);
  assert.deepEqual(game.platforms, ["PC"]);
});

test("IGDB related games are sourced from the provider similarity relation", async () => {
  const provider = new IgdbProvider("id", "secret", async (input) => {
    if (String(input).startsWith("https://id.twitch.tv")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify([{ id: 1, similar_games: [{ id: 2, name: "Similar Game", first_release_date: 1_700_000_000, platforms: [] }] }]), { status: 200 });
  });
  const related = await provider.related?.({ provider: "igdb", providerId: "1", mediaType: "game", title: "Original", genres: [], platforms: [] });
  assert.deepEqual(related?.map(({ providerId, title }) => [providerId, title]), [["2", "Similar Game"]]);
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

test("Google Books retries transient discovery failures without parallel shelf fan-out", async () => {
  let calls = 0;
  const provider = new GoogleBooksProvider("key", async () => {
    calls += 1;
    if (calls === 1) return new Response("temporarily unavailable", { status: 503 });
    return new Response(JSON.stringify({ items: [{ id: "fiction", volumeInfo: { title: "Fiction Shelf" } }] }), { status: 200 });
  });
  const sections = await provider.discoverSections();
  assert.equal(calls, 2);
  assert.deepEqual(sections.map(({ label, items }) => [label, items.length]), [["Fiction books", 1]]);
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
