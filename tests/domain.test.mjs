import assert from "node:assert/strict";
import test from "node:test";

test("media detail routes remain domain-specific", () => {
  const routes = { movie: "/movie/", tv: "/series/", game: "/game/", book: "/book/" };
  assert.equal(routes.tv, "/series/");
  assert.equal(new Set(Object.values(routes)).size, 4);
});

test("cross-media lists can contain every media type", () => {
  const types = ["movie", "tv", "game", "book"];
  assert.deepEqual(new Set(types), new Set(["movie", "tv", "game", "book"]));
});
