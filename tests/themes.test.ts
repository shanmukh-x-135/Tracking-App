import assert from "node:assert/strict";
import test from "node:test";
import { findTheme, themeQuery, themesForMediaType } from "../src/lib/media/themes";

test("theme registry exposes only deterministic provider-backed domain mappings", () => {
  const cyberpunk = findTheme("cyberpunk");
  assert.ok(cyberpunk);
  assert.equal(themeQuery(cyberpunk, "game"), "cyberpunk");
  assert.deepEqual(cyberpunk.rules.game?.providerSignals, ["igdb.theme", "igdb.genre"]);
  assert.equal(findTheme("made-up-theme"), undefined);
});

test("theme registry defers unsupported domain combinations", () => {
  const basedOnBook = findTheme("based-on-a-book");
  assert.ok(basedOnBook);
  assert.equal(themeQuery(basedOnBook, "book"), undefined);
  assert.equal(themesForMediaType("book").some((theme) => theme.id === "based-on-a-book"), false);
});
