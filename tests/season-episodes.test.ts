import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSeasonEpisodes } from "../src/lib/tv/season-episodes";

test("season episode normalization preserves one canonical identity per coordinate", () => {
  const episodes = normalizeSeasonEpisodes([
    { id: "three", seasonNumber: 1, episodeNumber: 3, title: "Third" },
    { id: "one", seasonNumber: 1, episodeNumber: 1, title: "First" },
    { id: "one-repeated", seasonNumber: 1, episodeNumber: 1, title: "Duplicate coordinate" },
    { id: "three", seasonNumber: 1, episodeNumber: 2, title: "Duplicate provider identity" },
    { id: "invalid", seasonNumber: 1, episodeNumber: 0, title: "Invalid" },
  ]);
  assert.deepEqual(episodes.map((episode) => [episode.id, episode.episodeNumber]), [["one", 1], ["three", 3]]);
});
