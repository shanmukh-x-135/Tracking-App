import assert from "node:assert/strict";
import test from "node:test";
import { createSpatialLayout } from "../src/lib/mosaic/spatial-layout";
import type { MosaicTile } from "../src/lib/mosaic/snapshot";

function tiles(count: number): MosaicTile[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `mock:movie:${index}`,
    providerId: String(index),
    title: `Story ${index}`,
    mediaType: index % 5 === 0 ? "series" : "movie",
    href: `/movie/${index}`,
    activity: { eventCount: index % 7 + 1, lastActivityAt: "2026-09-01" },
    userSignals: {},
    providerMetadata: {},
    visualWeight: 1 + (index % 7) * .14,
  }));
}

test("a large Mosaic has stable personal geometry within a fitted viewport", () => {
  const stories = tiles(500);
  const first = createSpatialLayout(stories, 1280, 720);
  const second = createSpatialLayout(stories, 1280, 720);
  assert.deepEqual(first, second);
  assert.equal(first.tiles.length, stories.length);
  assert.deepEqual(first.tiles.map(({ tile }) => tile.key), stories.map(({ key }) => key));
  assert.ok(first.bounds.right - first.bounds.left > 1280 * .7);
  assert.ok(first.bounds.bottom - first.bounds.top > 720 * .7);
  assert.ok(first.bounds.left > -640 && first.bounds.right < 640);
  assert.ok(first.bounds.top > -360 && first.bounds.bottom < 360);
});

test("sparse geometry stays bounded and does not manufacture tiles", () => {
  const empty = createSpatialLayout([], 390, 700);
  assert.deepEqual(empty.tiles, []);
  const single = createSpatialLayout(tiles(1), 390, 700);
  assert.equal(single.tiles.length, 1);
  assert.ok(single.tiles[0].width <= 150);
  assert.ok(single.bounds.left >= -195 && single.bounds.right <= 195);
});
