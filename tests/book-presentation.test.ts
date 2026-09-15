import assert from "node:assert/strict";
import test from "node:test";
import { BOOK_SYNOPSIS_COLLAPSE_THRESHOLD, bookSynopsis, normalizeBookCategories, shouldCollapseBookSynopsis } from "../src/lib/media/book-presentation";

test("book presentation normalizes noisy categories without losing useful values", () => {
  const categories = normalizeBookCategories([" Fiction / Romance ", "fiction, Romantic Comedy", "ROMANCE", "", "Contemporary"]);
  assert.deepEqual(categories, ["Fiction", "Romance", "Romantic Comedy", "Contemporary"]);
  assert.equal(categories.length, 4);
});

test("book synopsis collapses only long provider copy and has a missing-data fallback", () => {
  assert.equal(shouldCollapseBookSynopsis("A short synopsis."), false);
  assert.equal(shouldCollapseBookSynopsis("x".repeat(BOOK_SYNOPSIS_COLLAPSE_THRESHOLD + 1)), true);
  assert.equal(bookSynopsis(undefined), "A synopsis is not available for this edition yet.");
  assert.equal(bookSynopsis("  Multiple authors and missing pages do not affect synopsis presentation.  "), "Multiple authors and missing pages do not affect synopsis presentation.");
});
