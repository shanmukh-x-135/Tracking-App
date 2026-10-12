import assert from "node:assert/strict";
import test from "node:test";
import { mockCatalogProvider } from "../src/lib/media/providers/mock";
import { findTheme, mediaThemes, scoreThemeMatch, themeMediaTypes, themesForMediaType, themeSupports } from "../src/lib/media/themes";

test("every theme maps to provider metadata, never to a bare genre alias", () => {
  for (const theme of mediaThemes) {
    assert.ok(theme.rules.tmdbKeywords?.length, `${theme.id} needs TMDB keywords`);
    assert.ok(theme.rules.tmdbKeywords.every((id) => Number.isInteger(id) && id > 0));
  }
  const cyberpunk = findTheme("cyberpunk")!;
  assert.deepEqual(cyberpunk.rules.tmdbKeywords, [12190]);
  assert.deepEqual(cyberpunk.rules.igdb, { keywords: [103] });
  assert.equal(findTheme("made-up-theme"), undefined);
});

test("different themes query different provider metadata", () => {
  const signatures = mediaThemes.map((theme) => JSON.stringify(theme.rules.tmdbKeywords));
  assert.equal(new Set(signatures).size, mediaThemes.length);
});

test("unsupported medium combinations are explicit", () => {
  const slowBurn = findTheme("slow-burn")!;
  assert.deepEqual(themeMediaTypes(slowBurn), ["movie", "tv"]);
  assert.equal(themeSupports(findTheme("found-family")!, "game"), false);
  assert.equal(themeSupports(findTheme("based-on-a-book")!, "book"), false);
  assert.equal(themesForMediaType("book").some((theme) => theme.id === "based-on-a-book"), false);
  assert.equal(themesForMediaType(null).length, mediaThemes.length);
});

test("Slow Burn never becomes a literal book title search", () => {
  assert.equal(findTheme("slow-burn")!.rules.bookQuery, undefined);
});

test("mock theme ranking uses fixture text and assigns nothing to unmatched media", async () => {
  const mystery = findTheme("mystery")!;
  const match = { provider: "mock" as const, providerId: "one", mediaType: "movie" as const, title: "The detective", genres: ["Mystery"], description: "A whodunit." };
  assert.ok(scoreThemeMatch(match, mystery) > 0);
  assert.equal(scoreThemeMatch({ ...match, title: "Space battle", genres: ["Action"], description: "" }, mystery), 0);
  assert.deepEqual(await mockCatalogProvider.discoverByTheme!("game", findTheme("found-family")!), []);
});
