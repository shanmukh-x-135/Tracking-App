import assert from "node:assert/strict";
import test from "node:test";
import { deriveMosaicRecap } from "../src/lib/mosaic/recap";
import { periodFor } from "../src/lib/mosaic/snapshot";
import { emptyMosaicState } from "../src/lib/persistence/types";
import type { CatalogMovie, CatalogSeries } from "../src/lib/media/types";

const movie: CatalogMovie = { provider: "mock", providerId: "recap-movie", mediaType: "movie", title: "Recap Movie", genres: ["Drama"] };
const series: CatalogSeries = { provider: "mock", providerId: "recap-series", mediaType: "tv", title: "Recap Series", genres: ["Science Fiction"] };

test("monthly recap only describes real activity and optional signals that exist", () => {
  const state = emptyMosaicState();
  state.library = [{ media: movie, status: "watched", isFavorite: true, updatedAt: "2026-09-01T00:00:00.000Z" }];
  state.movieWatches = [{ id: "movie", media: movie, watchedAt: "2026-09-02T00:00:00.000Z", isRewatch: true }];
  state.ratings = [{ mediaKey: "mock:movie:recap-movie", value: 4.5, updatedAt: "2026-09-02T00:00:00.000Z" }];
  state.episodeWatches = [{ id: "episode", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-09-03T00:00:00.000Z" }];
  const recap = deriveMosaicRecap(state, periodFor("2026-09"));
  assert.equal(recap.snapshot.tiles.length, 2);
  assert.deepEqual(recap.scenes.map((scene) => scene.id), ["opening", "breakdown", "episodes", "ratings", "favorites", "rewatches", "final"]);
  assert.match(recap.scenes.find((scene) => scene.id === "ratings")?.detail ?? "", /★ 4.5/);
});

test("recap omits ratings and rewatches when basic activity is all that exists", () => {
  const state = emptyMosaicState();
  state.movieWatches = [{ id: "movie", media: movie, watchedAt: "2026-09-02T00:00:00.000Z", isRewatch: false }];
  const recap = deriveMosaicRecap(state, periodFor("2026-09"));
  assert.equal(recap.scenes.some((scene) => scene.id === "ratings" || scene.id === "rewatches" || scene.id === "favorites"), false);
});

test("recap keeps a quiet period honest", () => {
  const recap = deriveMosaicRecap(emptyMosaicState(), periodFor("2026-09"));
  assert.deepEqual(recap.scenes.map((scene) => scene.id), ["opening", "empty", "final"]);
  assert.match(recap.scenes[0].detail, /No activity/);
});

test("month filtering does not admit adjacent-month activity", () => {
  const state = emptyMosaicState();
  state.movieWatches = [{ id: "august", media: movie, watchedAt: "2026-08-31T00:00:00.000Z", isRewatch: false }, { id: "september", media: movie, watchedAt: "2026-09-01T00:00:00.000Z", isRewatch: false }];
  assert.equal(deriveMosaicRecap(state, periodFor("2026-09")).snapshot.tiles[0]?.activity.eventCount, 1);
});
