import assert from "node:assert/strict";
import test from "node:test";
import { episodeRatingCategory, episodeRatingLegend } from "../src/components/detail/episode-ratings-map";

test("public episode rating categories preserve the supplied legend and boundary values", () => {
  assert.deepEqual(episodeRatingLegend.map(({ label, color }) => [label, color]), [
    ["Absolute Cinema", "#38BDF8"], ["Awesome", "#22C55E"], ["Great", "#4ADE80"], ["Good", "#FDE047"], ["Average", "#F59E0B"], ["Bad", "#FB7185"], ["Garbage", "#A855F7"],
  ]);
  assert.equal(episodeRatingCategory(9.7), "Absolute Cinema");
  assert.equal(episodeRatingCategory(9.0), "Awesome");
  assert.equal(episodeRatingCategory(8.0), "Great");
  assert.equal(episodeRatingCategory(7.0), "Good");
  assert.equal(episodeRatingCategory(6.0), "Average");
  assert.equal(episodeRatingCategory(5.0), "Bad");
  assert.equal(episodeRatingCategory(4.9), "Garbage");
  assert.equal(episodeRatingCategory(), "Unrated");
});
