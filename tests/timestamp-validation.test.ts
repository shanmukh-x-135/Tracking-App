import assert from "node:assert/strict";
import test from "node:test";
import { persistenceMutationSchema } from "../src/lib/persistence/validation";
import { applyMutation } from "../src/lib/persistence/domain";
import { emptyMosaicState } from "../src/lib/persistence/types";

const episode = {
  type: "episode.log" as const,
  series: { provider: "tmdb" as const, providerId: "1396", mediaType: "tv" as const, title: "Breaking Bad", genres: [] },
  seasonNumber: 1, episodeNumber: 1, rating: 4.5,
};

for (const watchedAt of [
  "2020-01-02T03:04:05Z",
  "2020-01-02T03:04:05+00:00",
  "2020-01-02T08:34:05+05:30",
  "2020-01-01T22:04:05-05:00",
  "2020-01-02T03:04:05.123456+00:00",
]) {
  test(`episode validator preserves explicit-offset timestamp ${watchedAt}`, () => {
    const parsed = persistenceMutationSchema.parse({ ...episode, watchedAt });
    assert.equal(parsed.type, "episode.log");
    if (parsed.type !== "episode.log") throw new Error("Unexpected mutation.");
    assert.equal(parsed.watchedAt, watchedAt);
    const state = applyMutation(emptyMosaicState(), parsed, "2026-09-19T00:00:00Z");
    assert.equal(state.episodeWatches[0].watchedAt, watchedAt);
    assert.equal(Date.parse(state.episodeWatches[0].watchedAt), Date.parse(watchedAt));
  });
}

test("offset representations preserve the same historical instant", () => {
  const timestamps = ["2020-01-02T03:04:05Z", "2020-01-02T03:04:05+00:00", "2020-01-02T08:34:05+05:30", "2020-01-01T22:04:05-05:00"];
  assert.equal(new Set(timestamps.map(Date.parse)).size, 1);
});

for (const watchedAt of [
  "2020-01-02T03:04:05", "2020-01-02", "2020-02-30T03:04:05Z",
  "2020-13-02T03:04:05Z", "2020-01-02T25:04:05Z", "2020-01-02T03:60:05Z",
  "2020-01-02T03:04:05+24:00", "2020-01-02T03:04:05+05:60",
  "2020-01-02T03:04:05+5:30", "2020-01-02T03:04:05Zjunk", "not-a-timestamp",
]) {
  test(`episode validator rejects malformed timestamp ${watchedAt}`, () => {
    assert.equal(persistenceMutationSchema.safeParse({ ...episode, watchedAt }).success, false);
  });
}
