import assert from "node:assert/strict";
import test from "node:test";
import { catalogDetailResponse, catalogSearchResponse, filterCatalogSearchItems, parseCatalogSearchRequest } from "../src/lib/api/catalog-contract";
import { mockCatalogProvider } from "../src/lib/media/providers/mock";
import type { CatalogMedia, CatalogSearchResult } from "../src/lib/media/types";

async function mockDetail(providerId: string, mediaType: CatalogMedia["mediaType"]): Promise<CatalogMedia> {
  const media = await mockCatalogProvider.getById(providerId, mediaType);
  assert.ok(media, `Expected ${providerId} to exist in the normalized mock catalog.`);
  return media;
}

test("mobile catalog detail shapes preserve stable identity and normalized artwork for every media type", async () => {
  const [movie, series, game, book] = await Promise.all([
    mockDetail("dune-part-two", "movie"), mockDetail("severance", "tv"), mockDetail("red-dead-redemption-2", "game"), mockDetail("dune", "book"),
  ]);

  for (const item of [movie, series, game, book]) {
    assert.equal(item.provider, "mock");
    assert.equal(typeof item.providerId, "string");
    assert.match(item.posterUrl ?? "", /^https:\/\//);
    if (item.backdropUrl) assert.match(item.backdropUrl, /^https:\/\//);
  }
  assert.equal(movie.mediaType, "movie");
  assert.equal(movie.runtimeMinutes, 166);
  assert.equal(series.mediaType, "tv");
  assert.equal(series.seasonCount, 2);
  assert.equal(game.mediaType, "game");
  assert.deepEqual(game.platforms, ["PC", "PlayStation", "Xbox"]);
  assert.equal(book.mediaType, "book");
  assert.deepEqual(book.authors, ["Frank Herbert"]);
});

test("All search preserves every normalized media type and a type filter preserves only its requested domain", async () => {
  const all = await Promise.all([
    mockDetail("dune-part-two", "movie"), mockDetail("severance", "tv"), mockDetail("red-dead-redemption-2", "game"), mockDetail("dune", "book"),
  ]);
  assert.deepEqual(filterCatalogSearchItems(all, undefined).map((item) => item.mediaType), ["movie", "tv", "game", "book"]);
  assert.deepEqual(filterCatalogSearchItems(all, "tv").map(({ provider, mediaType, providerId }) => ({ provider, mediaType, providerId })), [{ provider: "mock", mediaType: "tv", providerId: "severance" }]);
});

test("catalog search request validation gives All and media filters unambiguous semantics", async () => {
  const all = parseCatalogSearchRequest(new Request("https://mosaic.test/api/catalog/search?q=%20Dune%20"));
  assert.deepEqual(all, { query: "Dune" });
  const series = parseCatalogSearchRequest(new Request("https://mosaic.test/api/catalog/search?q=Dune&type=tv"));
  assert.deepEqual(series, { query: "Dune", mediaType: "tv" });

  const invalidQuery = parseCatalogSearchRequest(new Request("https://mosaic.test/api/catalog/search?q=x"));
  assert.ok(invalidQuery instanceof Response);
  assert.equal(invalidQuery.status, 400);
  assert.deepEqual(await invalidQuery.json(), { error: { code: "VALIDATION_ERROR", message: "Query must contain between 2 and 100 characters." } });

  const invalidType = parseCatalogSearchRequest(new Request("https://mosaic.test/api/catalog/search?q=Dune&type=series"));
  assert.ok(invalidType instanceof Response);
  assert.equal(invalidType.status, 400);
  assert.deepEqual(await invalidType.json(), { error: { code: "VALIDATION_ERROR", message: "Type must be movie, tv, game, or book." } });
});

test("catalog search preserves partial success and normalizes total provider failure", async () => {
  const item = await mockDetail("dune", "book");
  const partial: CatalogSearchResult = { items: [item], failures: [{ provider: "igdb", message: "Search is temporarily unavailable." }] };
  const partialResponse = catalogSearchResponse(partial);
  assert.equal(partialResponse.status, 200);
  const partialBody = await partialResponse.json() as CatalogSearchResult;
  assert.deepEqual(partialBody.failures, partial.failures);
  assert.deepEqual(partialBody.items.map(({ provider, mediaType, providerId }) => ({ provider, mediaType, providerId })), [{ provider: "mock", mediaType: "book", providerId: "dune" }]);
  assert.equal("originalTitle" in partialBody.items[0], false);

  const emptyPartial = catalogSearchResponse({ items: [], failures: [{ provider: "igdb", message: "Search is temporarily unavailable." }] });
  assert.equal(emptyPartial.status, 200);

  const unavailable = catalogSearchResponse({ items: [], failures: [{ provider: "tmdb", message: "Search is temporarily unavailable." }] }, true);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: { code: "PROVIDER_UNAVAILABLE", message: "Catalog search is temporarily unavailable. Please try again." } });
});

test("catalog detail response distinguishes not-found and provider outage without leaking upstream errors", async () => {
  const missing = await catalogDetailResponse(async () => null);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: "NOT_FOUND", message: "Media item not found." } });

  const unavailable = await catalogDetailResponse(async () => { throw new Error("upstream token details"); });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: { code: "PROVIDER_UNAVAILABLE", message: "Catalog details are temporarily unavailable. Please try again." } });
});
