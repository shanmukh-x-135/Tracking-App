import assert from "node:assert/strict";
import test from "node:test";
import { findTheme, scoreThemeMatch, themeSearchTerms, themesForMediaType } from "../src/lib/media/themes";

test("theme registry exposes deterministic semantic provider-backed mappings", () => {
  const cyberpunk = findTheme("cyberpunk");
  assert.ok(cyberpunk);
  assert.deepEqual(themeSearchTerms(cyberpunk, "game"), ["science fiction", "futuristic action"]);
  assert.ok(!themeSearchTerms(cyberpunk, "game").includes("cyberpunk"));
  assert.ok(cyberpunk.rules.game?.providerSignals.includes("igdb.theme"));
  assert.equal(findTheme("made-up-theme"), undefined);
});

test("Slow Burn never becomes a literal title search", () => {
  const slowBurn = findTheme("slow-burn");
  assert.ok(slowBurn);
  for (const mediaType of ["movie", "tv", "book"] as const) {
    const terms = themeSearchTerms(slowBurn, mediaType);
    assert.ok(terms.length > 0);
    assert.ok(!terms.some((term) => term.toLowerCase() === "slow burn"));
  }
});

test("theme registry defers unsupported domain combinations", () => {
  const basedOnBook = findTheme("based-on-a-book");
  assert.ok(basedOnBook);
  assert.deepEqual(themeSearchTerms(basedOnBook, "book"), []);
  assert.equal(themesForMediaType("book").some((theme) => theme.id === "based-on-a-book"), false);
});

test("theme scoring ranks provider metadata without assigning a theme to unmatched media", () => {
  const slowBurn = findTheme("slow-burn");
  assert.ok(slowBurn?.rules.movie);
  const match = { provider: "mock" as const, providerId: "one", mediaType: "movie" as const, title: "A quiet character study", genres: ["Drama"], description: "A psychological portrait." };
  const unrelated = { ...match, providerId: "two", title: "Space battle", genres: ["Action"], description: "" };
  assert.ok(scoreThemeMatch(match, slowBurn.rules.movie) > 0);
  assert.equal(scoreThemeMatch(unrelated, slowBurn.rules.movie), 0);
});
